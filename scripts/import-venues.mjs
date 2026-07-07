#!/usr/bin/env node
/**
 * Venue layer import (PLAN.md §6): pull court/park POIs for the launch metro
 * from OpenStreetMap via Overpass, dedupe against nearby duplicates, and emit
 * an idempotent SQL file for the venues table.
 *
 * Unnamed courts are named from their containing named area (park, school,
 * sports centre …) via a second Overpass query — "Zilker Park — Basketball
 * court" instead of a bare "Basketball court". Street address is the fallback.
 *
 * Usage:
 *   node scripts/import-venues.mjs                # Austin (default)
 *   node scripts/import-venues.mjs --bbox 30.09,-97.95,30.52,-97.55
 *
 * Output:
 *   supabase/venues_import.sql — full idempotent import (new DBs / new rows)
 *   supabase/venues_rename.sql — one-time renames for rows already imported
 *     under the old generic names (only written when any name improved)
 * Review, then apply with
 *   pnpm dlx supabase db execute --file supabase/venues_import.sql
 * (or paste into the dashboard SQL editor).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Austin metro bbox (south,west,north,east)
const DEFAULT_BBOX = "30.09,-97.95,30.52,-97.55";

const bboxArg = process.argv.indexOf("--bbox");
const bbox = bboxArg > -1 ? process.argv[bboxArg + 1] : DEFAULT_BBOX;

// leisure=pitch with the launch sports (§6); OSM sport tags are lowercase.
// running tracks come from leisure=track + sport=running|athletics.
const courtsQuery = `
[out:json][timeout:90];
(
  nwr["leisure"="pitch"]["sport"~"^(pickleball|tennis|basketball)$"](${bbox});
  nwr["leisure"="pitch"]["sport"~"pickleball"](${bbox});
  nwr["leisure"="track"]["sport"~"^(running|athletics)$"](${bbox});
);
out center tags;
`;

// Named areas that can lend their name to an unnamed court inside them.
// Ways/relations only (nodes carry no bounds); `out tags bb` returns each
// element's bounding box, which is enough for a containment heuristic.
const parentsQuery = `
[out:json][timeout:120];
(
  wr["name"]["leisure"~"^(park|recreation_ground|sports_centre|stadium|playground|garden|golf_course)$"](${bbox});
  wr["name"]["landuse"="recreation_ground"](${bbox});
  wr["name"]["amenity"~"^(school|college|university|community_centre)$"](${bbox});
);
out tags bb;
`;

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function sportsFromTags(tags) {
  const raw = (tags.sport ?? "").toLowerCase();
  const sports = new Set();
  for (const s of raw.split(";").map((x) => x.trim())) {
    if (s === "pickleball" || s === "tennis" || s === "basketball") sports.add(s);
    if (s === "running" || s === "athletics") sports.add("running");
  }
  return [...sports];
}

function escapeSql(s) {
  return s.replace(/'/g, "''");
}

async function overpass(query) {
  for (const url of OVERPASS_URLS) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "pickup-sports-venue-import/0.2 (one-time seed script)",
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (res.ok) return res.json();
    console.error(`Overpass ${url} failed: ${res.status} ${res.statusText}`);
  }
  return null;
}

const courtsData = await overpass(courtsQuery);
if (!courtsData) process.exit(1);
const parentsData = await overpass(parentsQuery);
if (!parentsData) console.error("Parent-area query failed — falling back to street names only.");

// Cap parent size so a metro-scale relation (greenbelt, district) never
// swallows every court: ~0.002 deg² ≈ a 4×5 km bbox.
const MAX_PARENT_AREA = 0.002;
const parents = (parentsData?.elements ?? [])
  .filter((el) => el.tags?.name && el.bounds)
  .map((el) => ({
    name: el.tags.name,
    minlat: el.bounds.minlat,
    minlon: el.bounds.minlon,
    maxlat: el.bounds.maxlat,
    maxlon: el.bounds.maxlon,
    area: (el.bounds.maxlat - el.bounds.minlat) * (el.bounds.maxlon - el.bounds.minlon),
  }))
  .filter((p) => p.area <= MAX_PARENT_AREA);

// Smallest named area whose bbox contains the point (strict beats a ~30m
// loose match, then smaller area beats larger — a school inside a park wins).
function parentNameFor(lat, lon) {
  const LOOSE = 0.0003; // ~30m
  let best = null;
  for (const p of parents) {
    if (
      lat < p.minlat - LOOSE || lat > p.maxlat + LOOSE ||
      lon < p.minlon - LOOSE || lon > p.maxlon + LOOSE
    )
      continue;
    const strict = lat >= p.minlat && lat <= p.maxlat && lon >= p.minlon && lon <= p.maxlon;
    const tier = strict ? 0 : 1;
    if (!best || tier < best.tier || (tier === best.tier && p.area < best.area)) {
      best = { tier, area: p.area, name: p.name };
    }
  }
  return best?.name ?? null;
}

const seen = new Set();
const rows = [];
const renames = [];
for (const el of courtsData.elements ?? []) {
  const tags = el.tags ?? {};
  const sports = sportsFromTags(tags);
  if (sports.length === 0) continue;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) continue;

  const sportCap = `${sports[0][0].toUpperCase()}${sports[0].slice(1)}`;
  // Old fallback scheme (kept for the rename mapping below)
  const legacyName =
    tags.name ??
    `${sportCap} court${tags["addr:street"] ? ` — ${tags["addr:street"]}` : ""}`;

  let name = tags.name;
  if (!name) {
    const parent = parentNameFor(lat, lon);
    name = parent ? `${parent} — ${sportCap} court` : legacyName;
  }

  // dedupe unnamed courts that sit within ~50m of one another (court clusters)
  const key = `${name}|${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (seen.has(key)) continue;
  seen.add(key);

  const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]]
    .filter(Boolean)
    .join(" ");
  const courtCount = /^\d+$/.test(tags.capacity ?? "") ? Number(tags.capacity) : null;

  name = name.slice(0, 120);
  rows.push({ name, sports, lat, lon, address, courtCount, osmId: `${el.type}/${el.id}` });
  if (name !== legacyName.slice(0, 120)) {
    renames.push({ oldName: legacyName.slice(0, 120), newName: name, lat, lon });
  }
}

if (rows.length === 0) {
  console.error("No venues found — check the bbox or Overpass availability.");
  process.exit(1);
}

const values = rows
  .map(
    (r) =>
      `  ('${escapeSql(r.name)}', '{${r.sports.join(",")}}'::sport[], st_point(${r.lon}, ${r.lat})::geography, ${
        r.address ? `'${escapeSql(r.address)}'` : "null::text"
      }, ${r.courtCount ?? "null::int"}, 'osm'::venue_source, false)`
  )
  .join(",\n");

const sql = `-- Generated by scripts/import-venues.mjs (${new Date().toISOString()})
-- Source: OpenStreetMap via Overpass (bbox ${bbox}) — ODbL attribution applies.
-- ${rows.length} venues. Idempotent: skips names already present.

insert into venues (name, sports, location, address, court_count, source, verified)
select v.* from (values
${values}
) as v(name, sports, location, address, court_count, source, verified)
where not exists (
  select 1 from venues x
  where x.name = v.name
    and st_dwithin(x.location, v.location, 100)
);
`;

const outPath = resolve(import.meta.dirname, "../supabase/venues_import.sql");
writeFileSync(outPath, sql);
const bySport = {};
for (const r of rows) for (const s of r.sports) bySport[s] = (bySport[s] ?? 0) + 1;
console.log(`Wrote ${rows.length} venues to ${outPath}`);
console.log(`By sport: ${JSON.stringify(bySport)}`);
console.log(`Named from parent area: ${renames.length}`);

// One-time rename file for rows that were imported under the legacy generic
// names. Idempotent: matches on the old name + location, skips if a venue
// with the new name already exists nearby.
if (renames.length > 0) {
  const renameSql = `-- Generated by scripts/import-venues.mjs (${new Date().toISOString()})
-- Renames ${renames.length} previously imported OSM venues from generic names
-- ("Basketball court") to parent-area names ("Zilker Park — Basketball court").
-- Idempotent: no-op for rows already renamed or manually edited.

${renames
  .map(
    (r) => `update venues set name = '${escapeSql(r.newName)}'
where source = 'osm' and verified = false
  and name = '${escapeSql(r.oldName)}'
  and st_dwithin(location, st_point(${r.lon}, ${r.lat})::geography, 30)
  and not exists (
    select 1 from venues x
    where x.name = '${escapeSql(r.newName)}'
      and st_dwithin(x.location, st_point(${r.lon}, ${r.lat})::geography, 100)
  );`
  )
  .join("\n\n")}
`;
  const renamePath = resolve(import.meta.dirname, "../supabase/venues_rename.sql");
  writeFileSync(renamePath, renameSql);
  console.log(`Wrote ${renames.length} renames to ${renamePath}`);
}

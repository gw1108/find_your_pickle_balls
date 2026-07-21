-- 'other' generic bucket for events (design tag-92bc8a). Isolated migration:
-- ADD VALUE cannot be used in the same transaction that references it.
alter type sport add value 'other';

-- Speed chain-scoped listing (newest first).

create index if not exists reservation_stub_chain_created_at_desc_idx
  on reservations.reservation_stub (chain_id, created_at desc);


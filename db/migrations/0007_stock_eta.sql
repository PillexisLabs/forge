-- When stock on the way is expected, so a quote can say when an item ships.
alter table inv_items add column if not exists incoming_local_eta date;
alter table inv_items add column if not exists incoming_import_eta date;

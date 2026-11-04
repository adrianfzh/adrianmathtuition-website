-- SCIENCE project eaxnstsecxmqdobfvmjh (Adrian, 4 Nov 2026: "Yes, fix them").
--
-- auto_wire_phys_image() is the trigger auto_wire_phys_image_trigger on
-- storage.objects: when a phys_… picture lands in the question_images bucket it
-- links the file to its question (image_url / images). It returns `trigger`, so
-- PostgREST cannot call it — an anon POST to /rest/v1/rpc/auto_wire_phys_image
-- returned 404 PGRST202 on 4 Nov 2026. The advisor warning was a false alarm;
-- this is a tidy-up so the warning clears and a future change cannot expose it.
--
-- Postgres checks EXECUTE on a trigger function only at CREATE TRIGGER time, not
-- when the trigger fires, so uploads by any role keep wiring pictures.
-- search_path was already pinned to 'public'.

revoke execute on function public.auto_wire_phys_image() from public, anon, authenticated;
grant execute on function public.auto_wire_phys_image() to service_role;

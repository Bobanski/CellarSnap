-- App-owned hooks on managed Auth; replay after public.sql.
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER on_auth_user_phone_updated AFTER UPDATE OF phone ON auth.users FOR EACH ROW WHEN (old.phone IS DISTINCT FROM new.phone) EXECUTE FUNCTION handle_auth_user_phone_update();

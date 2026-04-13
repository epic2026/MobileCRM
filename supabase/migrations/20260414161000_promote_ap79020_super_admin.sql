-- Promote a specific user to super_admin.
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id
  INTO v_user_id
  FROM public.profiles
  WHERE lower(email) = lower('ap79020@gmail.com')
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email ap79020@gmail.com not found in public.profiles';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END
$$;
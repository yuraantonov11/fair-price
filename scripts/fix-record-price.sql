drop function if exists public.record_price(text,text,text,text,bigint,bigint,boolean,text);

drop function if exists public.record_price(text,text,text,text,integer,integer,boolean,text);

create or replace function public.record_price(
  p_store_domain text,
  p_external_id text,
  p_url text,
  p_name text,
  p_price integer,
  p_regular_price integer default null,
  p_is_available boolean default true,
  p_promo_name text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_product_id uuid;
  v_last_price integer;
begin
  insert into public.products (store_domain, external_id, url, name, updated_at)
  values (p_store_domain, p_external_id, p_url, p_name, now())
  on conflict (url)
  do update set
    store_domain = excluded.store_domain,
    external_id = excluded.external_id,
    name = excluded.name,
    updated_at = now()
  returning id into v_product_id;

  select price into v_last_price
  from public.price_history
  where product_id = v_product_id
  order by valid_from desc
  limit 1;

  if v_last_price is distinct from p_price then
    insert into public.price_history (
      product_id,
      price,
      regular_price,
      promo_name,
      is_available,
      valid_from
    ) values (
      v_product_id,
      p_price,
      p_regular_price,
      p_promo_name,
      coalesce(p_is_available, true),
      now()
    );
  end if;
end;
$$;


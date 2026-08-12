update lab_tests
set price_cents = case id
  when 'lab-cbc' then 120000
  when 'lab-glucose' then 45000
  when 'lab-lipid' then 180000
  when 'lab-thyroid' then 165000
  when 'lab-liver' then 210000
  when 'lab-kidney' then 195000
  else price_cents
end
where organization_id = 'org-medivanta-general'
  and price_cents = 0
  and id in (
    'lab-cbc',
    'lab-glucose',
    'lab-lipid',
    'lab-thyroid',
    'lab-liver',
    'lab-kidney'
  );

update invoice_items as ii
set unit_amount_cents = lt.price_cents,
    total_amount_cents = ii.quantity * lt.price_cents
from invoices as i
join lab_requests as lr
  on lr.id = i.source_id
 and i.source_type = 'lab-request'
join lab_tests as lt
  on lt.id = lr.test_id
 and lt.organization_id = i.organization_id
where ii.invoice_id = i.id
  and i.organization_id = 'org-medivanta-general'
  and i.payment_status <> 'Paid'
  and coalesce(i.total_cents, 0) = 0
  and coalesce(i.amount_due_cents, 0) = 0
  and lt.price_cents > 0;

update invoices as i
set subtotal_cents = totals.subtotal_cents,
    total_cents = totals.subtotal_cents,
    amount_due_cents = greatest(totals.subtotal_cents - i.amount_paid_cents, 0),
    payment_status = case
      when i.amount_paid_cents <= 0 then 'Pending'
      when i.amount_paid_cents >= totals.subtotal_cents then 'Paid'
      else 'Partially Paid'
    end,
    updated_at = now()
from (
  select ii.invoice_id, sum(ii.total_amount_cents)::integer as subtotal_cents
  from invoice_items as ii
  group by ii.invoice_id
) as totals
where i.id = totals.invoice_id
  and i.organization_id = 'org-medivanta-general'
  and i.payment_status <> 'Paid'
  and coalesce(i.total_cents, 0) = 0
  and coalesce(i.amount_due_cents, 0) = 0
  and totals.subtotal_cents > 0;

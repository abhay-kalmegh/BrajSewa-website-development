import { redirect } from 'next/navigation'

// The four-step prototype was replaced by a single /checkout page. Keep old links working.
export default function Page() {
  redirect('/checkout')
}

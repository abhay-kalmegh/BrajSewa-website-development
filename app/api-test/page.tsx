import type { Metadata } from 'next'
import { ApiTestPage } from '@/components/api-test-page'

export const metadata: Metadata = {
  title: 'Backend connection test · BrajSewa.com',
  description: 'Check the live BrajSewa Django API connection and response time.',
}

export default function Page() {
  return <ApiTestPage />
}

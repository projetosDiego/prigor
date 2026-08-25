import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function Home() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  if (session.role === 'ADMIN' || session.role === 'MANAGER') {
    redirect('/admin/dashboard');
  } else {
    redirect('/seller/dashboard');
  }
}

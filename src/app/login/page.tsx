import { LoginForm } from '@/components/LoginForm';

export const metadata = { title: 'Sign in · Morning Digest' };

export default function LoginPage() {
  return (
    <div className="shell">
      <section className="empty masthead reveal" style={{ marginTop: '12vh' }}>
        <div className="masthead-inner">
          <p className="dateline">
            <span>Private edition</span>
          </p>
          <h1 className="headline">Good morning.</h1>
          <LoginForm />
        </div>
      </section>
    </div>
  );
}

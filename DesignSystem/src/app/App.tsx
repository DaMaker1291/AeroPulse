import { useState } from 'react';
import { AccountCreation } from './components/AccountCreation';
import AuthenticatedApp from './AuthenticatedApp';

interface UserData {
  name: string;
  org: string;
  role: string;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<UserData | null>(null);

  const handleAuth = (userData: UserData) => {
    setUser(userData);
    setAuthenticated(true);
  };

  if (!authenticated) {
    return <AccountCreation onComplete={handleAuth} />;
  }

  return (
    <AuthenticatedApp
      user={user!}
      onSignOut={() => { setAuthenticated(false); setUser(null); }}
    />
  );
}

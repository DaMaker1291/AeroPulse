import { useState } from 'react';
import AuthenticatedApp from './AuthenticatedApp';
import { IntroPage } from './components/IntroPage';

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);

  if (!authenticated) {
    return <IntroPage onEnter={() => setAuthenticated(true)} />;
  }

  return (
    <AuthenticatedApp
      user={{ name: 'Dr. Sarah Chen', org: 'Memorial Hospital', role: 'Neurologist', reasonForVisit: '' }}
      onSignOut={() => setAuthenticated(false)}
    />
  );
}

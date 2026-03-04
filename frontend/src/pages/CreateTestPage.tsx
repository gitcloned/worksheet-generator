import { useAuth } from '../contexts/AuthContext';
import { Chat } from '../components/Chat/Chat';

export function CreateTestPage() {
  const { user } = useAuth();
  return <Chat userId={user?.id} />;
}

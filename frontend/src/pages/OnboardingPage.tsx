import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api';

export function OnboardingPage() {
  const [submitting, setSubmitting] = useState(false);
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();

  async function selectRole(role: 'parent' | 'student') {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const displayName = session.user.user_metadata?.full_name ?? null;

      const res = await fetch(`${BASE}/auth/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ role, display_name: displayName }),
      });

      if (!res.ok) throw new Error('Failed to create profile');

      await refreshProfile();
      navigate('/tests', { replace: true });
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Welcome to AI Practice</h1>
          <p className="text-gray-500 mt-2">Tell us who you are to get started</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <RoleCard
            title="I'm a Parent"
            description="Create tests and assign them to your children"
            icon="👨‍👩‍👧"
            onClick={() => selectRole('parent')}
            disabled={submitting}
          />
          <RoleCard
            title="I'm a Student"
            description="Practice with AI-generated tests and get instant feedback"
            icon="🎓"
            onClick={() => selectRole('student')}
            disabled={submitting}
          />
        </div>
      </div>
    </div>
  );
}

function RoleCard({
  title,
  description,
  icon,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  icon: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-3 rounded-2xl border-2 border-gray-200 bg-white p-6 text-center hover:border-brand-400 hover:bg-brand-50 transition-all disabled:opacity-60 shadow-sm"
    >
      <span className="text-4xl">{icon}</span>
      <div>
        <p className="font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </div>
    </button>
  );
}

import { AppLayout } from '@/components/layout/AppLayout';
import ProfileTab from '@/components/settings/ProfileTab';

export default function ProfilePage() {
  return (
    <AppLayout title="Meu Perfil" subtitle="Gerencie suas informações pessoais">
      <div className="max-w-2xl">
        <ProfileTab />
      </div>
    </AppLayout>
  );
}


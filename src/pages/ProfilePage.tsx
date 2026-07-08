import { AppLayout } from '@/components/layout/AppLayout';
import ProfileTab from '@/components/settings/ProfileTab';
import BiometricCredentialsCard from '@/components/settings/BiometricCredentialsCard';
import RoleAuditCard from '@/components/settings/RoleAuditCard';

export default function ProfilePage() {
  return (
    <AppLayout title="Meu Perfil" subtitle="Gerencie suas informações pessoais">
      <div className="max-w-2xl space-y-6">
        <ProfileTab />
        <RoleAuditCard />
        <BiometricCredentialsCard />
      </div>
    </AppLayout>
  );
}



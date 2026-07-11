import { AppLayout } from '@/components/layout/AppLayout';
import ProfileTab from '@/components/settings/ProfileTab';
import BiometricCredentialsCard from '@/components/settings/BiometricCredentialsCard';
import RoleAuditCard from '@/components/settings/RoleAuditCard';
import { useIsMobile } from '@/hooks/use-mobile';

export default function ProfilePage() {
  const isMobile = useIsMobile();
  return (
    <AppLayout title="Meu Perfil" subtitle="Gerencie suas informações pessoais">
      <div className="max-w-2xl space-y-6">
        <ProfileTab />
        <RoleAuditCard />
        {isMobile && <BiometricCredentialsCard />}
      </div>
    </AppLayout>
  );
}

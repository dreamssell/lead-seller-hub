import { AppLayout } from '@/components/layout/AppLayout';
import ProfileTab from '@/components/settings/ProfileTab';
import RoleAuditCard from '@/components/settings/RoleAuditCard';
// Biometria (Passkey) temporariamente desativada:
// - Desktop/PC/Notebook: removida por completo por decisão de produto.
// - Mobile: oculta até nova configuração (feedback negativo dos usuários).
// Não remover o arquivo `BiometricCredentialsCard` — será reativado no mobile.

export default function ProfilePage() {
  return (
    <AppLayout title="Meu Perfil" subtitle="Gerencie suas informações pessoais">
      <div className="max-w-2xl space-y-6">
        <ProfileTab />
        <RoleAuditCard />
      </div>
    </AppLayout>
  );
}

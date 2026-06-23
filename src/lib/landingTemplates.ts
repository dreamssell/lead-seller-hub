// Layout templates for landing pages. Apply on creation to skip manual setup.
export type LandingTemplate = {
  id: string;
  name: string;
  description: string;
  category: 'clinica' | 'servicos' | 'evento' | 'oferta' | 'imobiliaria';
  page: {
    title: string;
    headline: string;
    subheadline: string;
    page_bg_color: string;
    text_color: string;
    align: 'left' | 'center' | 'right';
    form_mode: 'none' | 'simple' | 'full';
    auto_create_lead: boolean;
  };
  buttons: Array<{
    label: string;
    url: string;
    action_type: 'whatsapp' | 'site' | 'link' | 'form';
    bg_color: string;
    text_color: string;
    shape: 'rounded' | 'square' | 'pill';
  }>;
};

export const LANDING_TEMPLATES: LandingTemplate[] = [
  {
    id: 'clinica',
    name: 'Clínica / Consultório',
    description: 'Header sóbrio, dois CTAs (WhatsApp e agendamento). Ideal para serviços de saúde.',
    category: 'clinica',
    page: {
      title: 'Clínica — Agendamento',
      headline: 'Cuide da sua saúde hoje',
      subheadline: 'Atendimento humanizado, horários flexíveis e equipe especializada à sua disposição.',
      page_bg_color: '#0E7C7B', text_color: '#FFFFFF', align: 'center',
      form_mode: 'simple', auto_create_lead: true,
    },
    buttons: [
      { label: 'Falar com atendente no WhatsApp', url: 'https://wa.me/5511999999999', action_type: 'whatsapp', bg_color: '#22C55E', text_color: '#FFFFFF', shape: 'pill' },
      { label: 'Agendar consulta', url: '#', action_type: 'form', bg_color: '#FFFFFF', text_color: '#0E7C7B', shape: 'pill' },
    ],
  },
  {
    id: 'whatsapp-direct',
    name: 'WhatsApp direto',
    description: 'Página minimalista de 1 botão grande para WhatsApp. Conversão máxima.',
    category: 'servicos',
    page: {
      title: 'Fale conosco no WhatsApp',
      headline: 'Atendimento agora',
      subheadline: 'Toque no botão e fale direto com a nossa equipe.',
      page_bg_color: '#075E54', text_color: '#FFFFFF', align: 'center',
      form_mode: 'none', auto_create_lead: false,
    },
    buttons: [
      { label: 'Abrir conversa no WhatsApp', url: 'https://wa.me/5511999999999?text=Olá', action_type: 'whatsapp', bg_color: '#25D366', text_color: '#FFFFFF', shape: 'pill' },
    ],
  },
  {
    id: 'multi-cta',
    name: 'Hub de canais (Linktree)',
    description: 'Vários botões empilhados: WhatsApp, site, redes sociais e formulário.',
    category: 'servicos',
    page: {
      title: 'Nossos canais',
      headline: 'Como podemos te ajudar?',
      subheadline: 'Escolha o canal que preferir.',
      page_bg_color: '#1E1B4B', text_color: '#FFFFFF', align: 'center',
      form_mode: 'none', auto_create_lead: true,
    },
    buttons: [
      { label: 'WhatsApp comercial', url: 'https://wa.me/5511999999999', action_type: 'whatsapp', bg_color: '#22C55E', text_color: '#FFFFFF', shape: 'rounded' },
      { label: 'Visitar nosso site', url: 'https://exemplo.com.br', action_type: 'site', bg_color: '#FFFFFF', text_color: '#1E1B4B', shape: 'rounded' },
      { label: 'Instagram', url: 'https://instagram.com/empresa', action_type: 'link', bg_color: '#E1306C', text_color: '#FFFFFF', shape: 'rounded' },
      { label: 'Quero receber proposta', url: '#', action_type: 'form', bg_color: '#F59E0B', text_color: '#1E1B4B', shape: 'rounded' },
    ],
  },
  {
    id: 'oferta-promo',
    name: 'Oferta promocional',
    description: 'Layout vibrante para promoções e descontos, com captura completa de lead.',
    category: 'oferta',
    page: {
      title: 'Promoção relâmpago',
      headline: '🔥 Oferta por tempo limitado',
      subheadline: 'Garanta sua condição especial preenchendo o formulário. Nossa equipe entra em contato em minutos.',
      page_bg_color: '#DC2626', text_color: '#FFFFFF', align: 'center',
      form_mode: 'full', auto_create_lead: true,
    },
    buttons: [
      { label: 'Quero aproveitar a oferta', url: 'https://wa.me/5511999999999', action_type: 'whatsapp', bg_color: '#FACC15', text_color: '#7F1D1D', shape: 'pill' },
    ],
  },
  {
    id: 'imobiliaria',
    name: 'Imobiliária / Imóvel',
    description: 'Header elegante, captura completa e link para tour virtual.',
    category: 'imobiliaria',
    page: {
      title: 'Imóvel destaque',
      headline: 'Conheça este imóvel exclusivo',
      subheadline: 'Tour virtual disponível. Agende uma visita ou converse com um especialista.',
      page_bg_color: '#0F172A', text_color: '#FFFFFF', align: 'left',
      form_mode: 'full', auto_create_lead: true,
    },
    buttons: [
      { label: 'Agendar visita', url: 'https://wa.me/5511999999999', action_type: 'whatsapp', bg_color: '#3B82F6', text_color: '#FFFFFF', shape: 'rounded' },
      { label: 'Ver tour virtual', url: 'https://exemplo.com.br/tour', action_type: 'site', bg_color: 'transparent', text_color: '#FFFFFF', shape: 'rounded' },
    ],
  },
  {
    id: 'evento',
    name: 'Evento / Inscrição',
    description: 'Para eventos, palestras e webinars com inscrição rápida.',
    category: 'evento',
    page: {
      title: 'Inscrição evento',
      headline: 'Inscreva-se no evento',
      subheadline: 'Vagas limitadas. Confirme presença em menos de 1 minuto.',
      page_bg_color: '#7C3AED', text_color: '#FFFFFF', align: 'center',
      form_mode: 'simple', auto_create_lead: true,
    },
    buttons: [
      { label: 'Confirmar minha inscrição', url: '#', action_type: 'form', bg_color: '#FFFFFF', text_color: '#7C3AED', shape: 'pill' },
    ],
  },
];

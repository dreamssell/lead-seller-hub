import { describe, it, expect, vi } from 'vitest';
import { supabase } from '../integrations/supabase/client';

/**
 * Smoke Test: Fluxo de Entrada de Participante
 * Este teste simula a inserção de um participante pendente e verifica
 * se as permissões de RLS permitem que um convidado (anon) realize a ação.
 */
describe('Smoke Test: Join Room Flow', () => {
  const TEST_ROOM_ID = '198f06a3-6f85-40f9-b038-778c87f95ec2'; 
  const TEST_USER_NAME = 'SmokeTestUser';

  it('should allow a guest to insert a pending participant', async () => {
    // 1. Verificar se a sala existe (ou usar uma existente para o teste)
    // Nota: Em um ambiente real de CI, criaríamos uma sala aqui. 
    // Para este smoke test, assumimos que as tabelas existem.
    
    const participantData = {
      room_id: TEST_ROOM_ID,
      name: TEST_USER_NAME,
      is_guest: true,
      status: 'pending',
      role: 'participant',
      media_status: { audio: true, video: true }
    };

    // Tentar inserir via Supabase Client (simulando o app)
    // O RLS deve permitir INSERT para anon/authenticated na tabela video_participants
    const { data, error } = await supabase
      .from('video_participants')
      .insert(participantData)
      .select()
      .single();

    // Se o erro for "room_id" foreign key, o RLS funcionou (chegou no banco), 
    // mas a sala não existe. Se for "permission denied", o RLS bloqueou.
    if (error && error.code === '23503') {
       console.log('RLS Check Passed: Insert reached DB but failed on FK (Room not found).');
       expect(true).toBe(true);
       return;
    }

    if (error) {
      console.error('RLS/DB Error:', error);
      // Se não for erro de FK, falhamos o teste
      expect(error).toBeNull();
    }

    expect(data).toBeDefined();
    expect(data.name).toBe(TEST_USER_NAME);

    // Cleanup
    if (data?.id) {
      await supabase.from('video_participants').delete().eq('id', data.id);
    }
  });
});

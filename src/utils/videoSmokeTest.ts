import { supabase } from '../integrations/supabase/client';

export async function runVideoSmokeTest() {
  console.log('🚀 Iniciando Smoke Test: Video Call Entry');
  
  try {
    // 1. Verificar se existe uma sala ativa ou criar uma temporária
    const { data: rooms, error: roomError } = await supabase
      .from('video_rooms')
      .select('id, invite_token')
      .eq('is_active', true)
      .limit(1);

    if (roomError) throw new Error(`Falha ao buscar salas: ${roomError.message}`);
    
    let targetRoomId;
    if (!rooms || rooms.length === 0) {
      console.log('📝 Nenhuma sala ativa encontrada, criando sala de teste...');
      const { data: newRoom, error: createError } = await supabase
        .from('video_rooms')
        .insert({
          title: 'Sala de Smoke Test',
          is_active: true,
          invite_token: 'smoke-test-token'
        })
        .select()
        .single();
      
      if (createError) throw createError;
      targetRoomId = newRoom.id;
    } else {
      targetRoomId = rooms[0].id;
    }

    console.log(`✅ Sala de teste identificada: ${targetRoomId}`);

    // 2. Tentar inserir um participante de teste (Simulando convidado)
    const testParticipantName = `SmokeTestUser_${Math.floor(Math.random() * 1000)}`;
    const { data: participant, error: pError } = await supabase
      .from('video_participants')
      .insert({
        room_id: targetRoomId,
        name: testParticipantName,
        is_guest: true,
        status: 'pending'
      })
      .select()
      .single();

    if (pError) {
      console.error('❌ Falha na inserção de participante (Possível erro de RLS ou Recursão):', pError);
      return { success: false, error: pError.message };
    }

    console.log(`✅ Participante inserido com sucesso: ${participant.id}`);

    // 3. Limpeza (opcional - marcar como left)
    await supabase.from('video_participants').update({ status: 'left' }).eq('id', participant.id);
    
    console.log('✨ Smoke Test finalizado com SUCESSO!');
    return { success: true };

  } catch (err: any) {
    console.error('❌ Erro crítico no Smoke Test:', err);
    return { success: false, error: err.message };
  }
}

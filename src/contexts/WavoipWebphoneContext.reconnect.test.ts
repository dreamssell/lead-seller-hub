import { describe, expect, it } from 'vitest';
import {
  isWavoipDeviceUnavailable,
  needsWavoipDeviceRecovery,
  shouldAcceptWavoipEventForCurrentCall,
} from './WavoipWebphoneContext';

describe('WavoipWebphoneContext — reconexão segura', () => {
  it('não encerra chamada ativa por evento global sem call_id', () => {
    expect(shouldAcceptWavoipEventForCurrentCall(null, 'WAVOIP-CALL-1', 'global')).toBe(false);
    expect(shouldAcceptWavoipEventForCurrentCall('WAVOIP-CALL-2', 'WAVOIP-CALL-1', 'global')).toBe(false);
    expect(shouldAcceptWavoipEventForCurrentCall('WAVOIP-CALL-1', 'WAVOIP-CALL-1', 'global')).toBe(true);
  });

  it('mantém compatibilidade com eventos emitidos no objeto da própria chamada', () => {
    expect(shouldAcceptWavoipEventForCurrentCall(null, 'WAVOIP-CALL-1', 'call')).toBe(true);
    expect(shouldAcceptWavoipEventForCurrentCall('WAVOIP-CALL-1', 'WAVOIP-CALL-1', 'call')).toBe(true);
    expect(shouldAcceptWavoipEventForCurrentCall('WAVOIP-CALL-2', 'WAVOIP-CALL-1', 'call')).toBe(false);
  });

  it('detecta devices Wavoip que precisam de re-registro sem tocar no histórico da conversa', () => {
    expect(isWavoipDeviceUnavailable({ token: 't1', enabled: false, status: 'connected' })).toBe(true);
    expect(isWavoipDeviceUnavailable({ token: 't1', enabled: true, status: 'CONNECTION_LOST' })).toBe(true);
    expect(isWavoipDeviceUnavailable({ token: 't1', enabled: true, status: 'connected' })).toBe(false);

    expect(needsWavoipDeviceRecovery(['t1', 't2'], [{ token: 't1', enabled: true, status: 'connected' }])).toBe(true);
    expect(needsWavoipDeviceRecovery(['t1'], [{ token: 't1', enabled: true, status: 'connected' }])).toBe(false);
  });
});
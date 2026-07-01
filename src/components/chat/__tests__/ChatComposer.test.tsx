import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChatComposer } from '../ChatComposer';

const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  message: vi.fn(),
  success: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('../FormatToolbar', () => ({ FormatToolbar: () => null }));
vi.mock('../QuickReplyPopover', () => ({ QuickReplyPopover: () => null }));
vi.mock('../AIAssistMenu', () => ({ AIAssistMenu: () => null }));
vi.mock('../AudioRecorder', () => ({ AudioRecorder: () => null }));

describe('ChatComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render a duplicate sonner/toast.error when ChatPage send handler fails', async () => {
    const onSendText = vi.fn().mockRejectedValue(new Error('mentioned does not meet minimum length of 1'));

    render(
      <ChatComposer
        conversationId="lead-1"
        text="oi"
        onChangeText={vi.fn()}
        onSendText={onSendText}
        recentMessages={[]}
      />
    );

    fireEvent.click(screen.getByTitle('Enviar (Enter)'));

    await waitFor(() => expect(onSendText).toHaveBeenCalledWith('oi'));
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
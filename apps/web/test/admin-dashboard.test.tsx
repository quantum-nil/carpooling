import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserModal } from '../app/admin-dashboard';

describe('admin user form', () => {
  afterEach(() => cleanup());
  it('rejects a short password before calling the API', async () => {
    const save = vi.fn();
    render(<UserModal mode="create" onCancel={vi.fn()} onSave={save} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Temporary password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/at least 12 characters/i)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('submits a valid new customer and supports cancellation', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const cancel = vi.fn();
    render(<UserModal mode="create" onCancel={cancel} onSave={save} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Temporary password'), { target: { value: 'SecurePassword123' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'New Customer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@example.com', role: 'CUSTOMER' }), 'create');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalledOnce();
  });
});

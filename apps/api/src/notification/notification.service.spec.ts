import { NotificationChannel, NotificationType } from '@prisma/client';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  const userId = '00000000-0000-0000-0000-000000000001';

  it('persists in-app notifications and queues enabled external channels', async () => {
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      notificationPreference: { findMany: jest.fn().mockResolvedValue([{ channel: NotificationChannel.EMAIL }]) },
      $transaction: jest.fn().mockImplementation(async (callback: (transaction: { notification: { create: jest.Mock } }) => unknown) => callback({ notification: { create: jest.fn().mockResolvedValue({ id: 'notification', deliveries: [{ id: 'in-app', channel: NotificationChannel.IN_APP }, { id: 'push', channel: NotificationChannel.PUSH }] }) } })),
    };
    const service = new NotificationService(prisma as never, queue as never, {} as never, {} as never);

    await service.create({ userId, type: NotificationType.RIDE_UPDATE, title: 'Ride updated', body: 'Your ride changed', channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH] });

    expect(prisma.notificationPreference.findMany).toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledWith('push');
    expect(queue.enqueue).not.toHaveBeenCalledWith('in-app');
  });

  it('does not send an already delivered notification', async () => {
    const prisma = { notificationDelivery: { findUnique: jest.fn().mockResolvedValue({ status: 'SENT' }), update: jest.fn() } };
    const email = { send: jest.fn() };
    const service = new NotificationService(prisma as never, {} as never, email as never, {} as never);

    await service.deliver('delivery');

    expect(email.send).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.update).not.toHaveBeenCalled();
  });

  it('marks a provider failure as retryable instead of losing the notification', async () => {
    const delivery = {
      id: 'delivery', status: 'PENDING', channel: NotificationChannel.EMAIL,
      notification: { title: 'Ride update', body: 'Status changed', data: null, user: { email: 'user@example.com', notificationDevices: [] } },
    };
    const email = { send: jest.fn().mockRejectedValue(new Error('provider unavailable')) };
    const update = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      notificationDelivery: {
        findUnique: jest.fn().mockResolvedValue(delivery),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update,
      },
    };
    const service = new NotificationService(prisma as never, {} as never, email as never, {} as never);

    await expect(service.deliver('delivery')).rejects.toThrow('provider unavailable');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'delivery' }, data: expect.objectContaining({ status: 'FAILED' }),
    }));
  });
});

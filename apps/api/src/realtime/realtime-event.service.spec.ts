import { RealtimeEventService } from './realtime-event.service';
import { REALTIME_EVENTS } from './realtime.types';

describe('RealtimeEventService', () => {
  it('publishes ride events to the ride room', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const service = new RealtimeEventService();
    service.bind({ to } as never);

    service.publishRideStatusChanged('00000000-0000-0000-0000-000000000001', { status: 'ACCEPTED' });

    expect(to).toHaveBeenCalledWith('ride:00000000-0000-0000-0000-000000000001');
    expect(emit).toHaveBeenCalledWith(REALTIME_EVENTS.RIDE_STATUS_CHANGED, { status: 'ACCEPTED' });
  });
});

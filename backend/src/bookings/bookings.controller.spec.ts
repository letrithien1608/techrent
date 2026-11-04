import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { Role } from '../generated/prisma/client';
import { BookingsController } from './bookings.controller';
import type { BookingsService } from './bookings.service';
import type { BookingSearchService } from './booking-search.service';

describe('BookingsController — phân quyền xác nhận đơn', () => {
  const reflector = new Reflector();

  it('PATCH /bookings/:id/confirm chỉ cho staff/admin (RolesGuard đọc metadata này)', () => {
    expect(
      reflector.get(ROLES_KEY, BookingsController.prototype.confirm),
    ).toEqual([Role.staff, Role.admin]);
  });

  it('truyền id người xác nhận từ token (không nhận từ client) xuống service', async () => {
    const service = { confirm: jest.fn().mockResolvedValue({}) };
    const controller = new BookingsController(
      service as unknown as BookingsService,
      {} as BookingSearchService,
    );
    await controller.confirm('booking-1', {
      userId: 'admin-1',
      email: 'a@b.c',
      role: Role.admin,
    });
    expect(service.confirm).toHaveBeenCalledWith('booking-1', 'admin-1');
  });
});

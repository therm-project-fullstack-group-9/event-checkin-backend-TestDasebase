import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  uuid,
  varchar,
  boolean,
  integer,
  unique,
  date,
} from "drizzle-orm/pg-core";
import { relations } from 'drizzle-orm';

export const bookingStatusEnum = pgEnum('booking_status', ['CONFIRMED', 'CHECKED_IN', 'CANCELLED']);
export const actionTypeEnum = pgEnum('action_type', ['IN', 'OUT']);


// USER TABLE
export const users = pgTable("users", {
    userId: uuid("id").primaryKey().defaultRandom(),
    firstName: varchar("first_name", { length: 255 }).notNull(),
    lastName: varchar("last_name", { length: 255 }).notNull(),
    nickname: varchar("nickname", { length: 255 }),
    birthday: date("birthday"),
    profileImage: text('profile_image'),
    backgroundImage: text('background_image'),
    occupation: varchar('occupation', { length: 100 }),
    workplace: varchar('workplace', { length: 100 }),
    emailAddress: varchar("email_address", { length: 255 }).notNull().unique(),
    phoneNumber: varchar("phone_number", { length: 10 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    createdUserDate: timestamp("created_user_date").defaultNow().notNull(),
    updatedUserDate: timestamp("updated_user_date").defaultNow().notNull(),
});

// EVENTS TABLE
export const events = pgTable('events', {
  eventId: uuid('event_id').defaultRandom().primaryKey(),
  eventName: varchar('event_name', { length: 150 }).notNull(),
  shortDescription: varchar('short_description', { length: 255 }).notNull(),
  description: text('description').notNull(),
  eventDate: date('event_date').notNull(),
  venue: varchar('venue', { length: 150 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  imageUrl: text('image_url').notNull(),
  userId: uuid('user_id').references(() => users.userId).notNull(), // ผู้จัดงาน (Organizer)
  eventsStatus: varchar('events_status', { length: 20 }).default('Upcoming').notNull(),
  maxCapacity: integer('max_capacity').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedEventDate: timestamp('updated_event_date').defaultNow(),
});

// SESSIONS TABLE
export const sessions = pgTable('sessions', {
  sessionId: uuid('session_id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.eventId, { onDelete: 'cascade' }).notNull(),
  startTime: varchar('start_time', { length: 20 }).notNull(),
  endTime: varchar('end_time', { length: 20 }).notNull(),
  capacity: integer('capacity').notNull(),
  booked: integer('booked').default(0).notNull(),
});

// BOOKINGS TABLE
export const bookings = pgTable('bookings', {
  bookingId: uuid('booking_id').defaultRandom().primaryKey(),
  ticketRef: varchar('ticket_ref', { length: 50 }).notNull().unique(),
  userId: uuid('user_id').references(() => users.userId).notNull(),
  eventId: uuid('event_id').references(() => events.eventId, { onDelete: 'cascade' }).notNull(),
  sessionId: uuid('session_id').references(() => sessions.sessionId, { onDelete: 'cascade' }).notNull(),
  bookingStatus: bookingStatusEnum('booking_status').default('CONFIRMED').notNull(),
  healthDeclaration: varchar('health_declaration', { length: 100 }),
  bookingDate: timestamp('booking_date').defaultNow().notNull(),
  checkInTime: timestamp('check_in_time'),
  cancelDate: timestamp('cancel_date'),
  updateBookingDate: timestamp('update_booking_date').defaultNow().notNull(),
});

// EVENT STAFFS TABLE
export const eventStaffs = pgTable('event_staffs', {
  staffAssignmentId: uuid('staff_assignment_id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.userId, { onDelete: 'cascade' }).notNull(),
  eventId: uuid('event_id').references(() => events.eventId, { onDelete: 'cascade' }).notNull(),
  assignedBy: uuid('assigned_by').references(() => users.userId).notNull(),
  zone: varchar('zone', { length: 50 }).default('จุดคัดกรองหลัก').notNull(),
}, (table) => [
  unique().on(table.userId, table.eventId)
]);

// CHECK IN LOGS TABLE
export const checkInLogs = pgTable('check_in_logs', {
  logId: uuid('log_id').defaultRandom().primaryKey(),
  bookingId: uuid('booking_id').references(() => bookings.bookingId, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.userId).notNull(), // สตาฟฟ์คนที่สแกน
  ticketRef: varchar('ticket_ref', { length: 50 }).notNull(),
  actionType: actionTypeEnum('action_type').default('IN').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});



// กำหนด Relations สำหรับ Drizzle Query



export const usersRelations = relations(users, ({ many }) => ({
  organizedEvents: many(events),
  bookings: many(bookings),
  staffAssignments: many(eventStaffs, { relationName: 'staffUser' }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  organizer: one(users, { fields: [events.userId], references: [users.userId] }),
  sessions: many(sessions),
  bookings: many(bookings),
  staffs: many(eventStaffs),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  event: one(events, { fields: [sessions.eventId], references: [events.eventId] }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  user: one(users, { fields: [bookings.userId], references: [users.userId] }),
  event: one(events, { fields: [bookings.eventId], references: [events.eventId] }),
  session: one(sessions, { fields: [bookings.sessionId], references: [sessions.sessionId] }),
  logs: many(checkInLogs),
}));

export const eventStaffsRelations = relations(eventStaffs, ({ one }) => ({
  user: one(users, { fields: [eventStaffs.userId], references: [users.userId], relationName: 'staffUser' }),
  assignedByUser: one(users, { fields: [eventStaffs.assignedBy], references: [users.userId], relationName: 'assignedByUser' }),
  event: one(events, { fields: [eventStaffs.eventId], references: [events.eventId] }),
}));

export const checkInLogsRelations = relations(checkInLogs, ({ one }) => ({
  booking: one(bookings, { fields: [checkInLogs.bookingId], references: [bookings.bookingId] }),
  scannedBy: one(users, { fields: [checkInLogs.userId], references: [users.userId] }),
}));
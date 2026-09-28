CREATE TYPE "public"."action_type" AS ENUM('IN', 'OUT');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('CONFIRMED', 'CHECKED_IN', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "bookings" (
	"booking_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_ref" varchar(50) NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"booking_status" "booking_status" DEFAULT 'CONFIRMED' NOT NULL,
	"health_declaration" varchar(100),
	"booking_date" timestamp DEFAULT now() NOT NULL,
	"check_in_time" timestamp,
	"cancel_date" timestamp,
	"update_booking_date" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_ticket_ref_unique" UNIQUE("ticket_ref")
);
--> statement-breakpoint
CREATE TABLE "check_in_logs" (
	"log_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"ticket_ref" varchar(50) NOT NULL,
	"action_type" "action_type" DEFAULT 'IN' NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_staffs" (
	"staff_assignment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"zone" varchar(50) DEFAULT 'จุดคัดกรองหลัก' NOT NULL,
	CONSTRAINT "event_staffs_user_id_event_id_unique" UNIQUE("user_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"event_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_name" varchar(150) NOT NULL,
	"short_description" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"event_date" varchar(50) NOT NULL,
	"venue" varchar(150) NOT NULL,
	"category" varchar(50) NOT NULL,
	"image_url" text NOT NULL,
	"user_id" uuid NOT NULL,
	"events_status" varchar(20) DEFAULT 'Upcoming' NOT NULL,
	"max_capacity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"start_time" varchar(20) NOT NULL,
	"end_time" varchar(20) NOT NULL,
	"capacity" integer NOT NULL,
	"booked" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"nickname" varchar(255),
	"birthday" date NOT NULL,
	"occupation" varchar(100),
	"workplace" varchar(100),
	"email_address" varchar(255) NOT NULL,
	"phone_number" varchar(10) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_user_date" timestamp DEFAULT now() NOT NULL,
	"updated_user_date" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_address_unique" UNIQUE("email_address"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_event_id_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_id_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_logs" ADD CONSTRAINT "check_in_logs_booking_id_bookings_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("booking_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_logs" ADD CONSTRAINT "check_in_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_staffs" ADD CONSTRAINT "event_staffs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_staffs" ADD CONSTRAINT "event_staffs_event_id_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_staffs" ADD CONSTRAINT "event_staffs_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_event_id_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("event_id") ON DELETE cascade ON UPDATE no action;
CREATE TYPE "public"."membership_state" AS ENUM('proposed', 'active');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('admin', 'member');--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "state" "membership_state" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "added_by_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "added_by_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "org_role" "org_role" DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_added_by_participant_id_participants_id_fk" FOREIGN KEY ("added_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_added_by_participant_id_participants_id_fk" FOREIGN KEY ("added_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;
CREATE TABLE "version_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"embedding_model_id" text NOT NULL,
	"embedding_model_version" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "version_chunks" ADD CONSTRAINT "version_chunks_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "version_chunks_version_chunk_unique" ON "version_chunks" USING btree ("version_id","chunk_index");--> statement-breakpoint
CREATE INDEX "version_chunks_embedding_hnsw" ON "version_chunks" USING hnsw ("embedding" vector_cosine_ops);
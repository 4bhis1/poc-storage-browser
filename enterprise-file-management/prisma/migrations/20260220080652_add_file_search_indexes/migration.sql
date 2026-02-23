-- CreateIndex
CREATE INDEX "FileObject_bucketId_key_idx" ON "FileObject"("bucketId", "key");

-- CreateIndex
CREATE INDEX "FileObject_bucketId_name_idx" ON "FileObject"("bucketId", "name");

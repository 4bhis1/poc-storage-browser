import prisma from "@/lib/prisma";

/**
 * Ensures a directory path exists in the database and returns the ID of the leaf folder.
 * This function handles nested paths (e.g., "a/b/c") relative to a parentId.
 * It's safe to call concurrently; it handles race conditions via findFirst/create.
 */
export async function ensureParentDirectories(
  bucketId: string,
  tenantId: string,
  path: string,
  userId: string | null,
  initialParentId: string | null = null,
): Promise<{ parentId: string | null; baseName: string }> {
  if (!path) return { parentId: initialParentId, baseName: "" };

  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { parentId: initialParentId, baseName: "" };

  // The last part is the name of the file or the folder itself.
  // The parts before it are the intermediate directories.
  const baseName = parts[parts.length - 1];
  const dirParts = parts.slice(0, -1);

  let currentParentId = initialParentId;
  let currentKeyPrefix = "";

  // If we have an initialParentId, we MUST get its key to build the full keys correctly
  if (initialParentId) {
    const parentFolder = await prisma.fileObject.findUnique({
      where: { id: initialParentId },
      select: { key: true },
    });
    if (parentFolder) {
      currentKeyPrefix = parentFolder.key.endsWith("/")
        ? parentFolder.key
        : `${parentFolder.key}/`;
    }
  }

  for (const part of dirParts) {
    const folderKey = `${currentKeyPrefix}${part}/`;
    const folderKeyNoSlash = `${currentKeyPrefix}${part}`;

    let folder = await prisma.fileObject.findFirst({
      where: {
        bucketId,
        key: { in: [folderKey, folderKeyNoSlash] },
        isFolder: true,
      },
      select: { id: true, key: true },
    });

    if (!folder) {
      try {
        folder = await prisma.fileObject.create({
          data: {
            name: part,
            key: folderKey,
            isFolder: true,
            size: BigInt(0),
            bucketId,
            tenantId,
            parentId: currentParentId,
            createdBy: userId,
          },
          select: { id: true, key: true },
        });
      } catch (err: any) {
        // Race condition: another request created it
        folder = await prisma.fileObject.findFirst({
          where: {
            bucketId,
            key: { in: [folderKey, folderKeyNoSlash] },
            isFolder: true,
          },
          select: { id: true, key: true },
        });
      }
    }

    currentParentId = folder?.id ?? null;
    currentKeyPrefix =
      folder?.key && folder.key.endsWith("/") ? folder.key : folderKey;
  }

  return { parentId: currentParentId, baseName };
}

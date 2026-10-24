/**
 * SCORM 1.2 Manifest Generator
 * Generates canonical imsmanifest.xml compliant with ADL SCORM 1.2 specifications.
 */

export interface ScormManifestOptions {
  lessonId: string;
  lessonTitle: string;
  files?: string[];
}

function escapeXml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeIdentifier(id: string): string {
  const sanitized = (id || 'lesson')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return sanitized || 'lesson';
}

/**
 * Generates a valid, canonical imsmanifest.xml string for SCORM 1.2.
 */
export function generateScorm12Manifest(options: ScormManifestOptions): string {
  const cleanId = sanitizeIdentifier(options.lessonId);
  const manifestId = `MANIFEST_${cleanId}`;
  const orgId = `ORG_${cleanId}`;
  const itemId = `ITEM_${cleanId}`;
  const resId = `RES_${cleanId}`;
  const escapedTitle = escapeXml(options.lessonTitle || 'Lección SCORM 1.2');

  const defaultFiles = ['index.html', 'lesson.json'];
  const allFiles = Array.from(new Set([...defaultFiles, ...(options.files || [])]));
  const fileElements = allFiles
    .map((file) => `      <file href="${escapeXml(file)}" />`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${manifestId}" version="1.2"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="${orgId}">
    <organization identifier="${orgId}">
      <title>${escapedTitle}</title>
      <item identifier="${itemId}" identifierref="${resId}">
        <title>${escapedTitle}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="${resId}" type="webcontent" adlcp:scormtype="sco" href="index.html">
${fileElements}
    </resource>
  </resources>
</manifest>`;
}

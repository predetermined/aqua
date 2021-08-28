import { Json, textDecoder, textEncoder } from "../shared.ts";

export function parseBody(buffer: Uint8Array): {
  body: Record<string, Json>;
  files: Record<string, File>;
} {
  const rawBody: string = textDecoder.decode(buffer);
  let body: Record<string, Json> = {};

  if (!rawBody) return { body: {}, files: {} };

  const files: Record<string, File> = (
    rawBody.match(
      /---(\n|\r|.)*?Content-Type.*(\n|\r)+(\n|\r|.)*?(?=((\n|\r)--|$))/g,
    ) || []
  ).reduce((files: { [name: string]: File }, fileString: string, i) => {
    const fileName = /filename="(.*?)"/.exec(fileString)?.[1];
    const fileType = /Content-Type: (.*)/.exec(fileString)?.[1]?.trim();
    const name = /name="(.*?)"/.exec(fileString)?.[1];

    if (!fileName || !name) return files;

    const uniqueString = fileString.match(
      /---(\n|\r|.)*?Content-Type.*(\n|\r)+(\n|\r|.)*?/g,
    )?.[0];

    if (!uniqueString) return files;

    const uniqueStringEncoded = textEncoder.encode(uniqueString);
    const endSequence = textEncoder.encode("----");

    let start = -1;
    let end = buffer.length;
    for (let i = 0; i < buffer.length; i++) {
      if (start === -1) {
        let matchedUniqueString = true;
        let uniqueStringEncodedIndex = 0;
        for (let j = i; j < i + uniqueStringEncoded.length; j++) {
          if (buffer[j] !== uniqueStringEncoded[uniqueStringEncodedIndex]) {
            matchedUniqueString = false;
            break;
          }
          uniqueStringEncodedIndex++;
        }

        if (matchedUniqueString) {
          i = start = i + uniqueStringEncoded.length;
        }
        continue;
      }

      let matchedEndSequence = true;
      let endSequenceIndex = 0;
      for (let j = i; j < i + endSequence.length; j++) {
        if (buffer[j] !== endSequence[endSequenceIndex]) {
          matchedEndSequence = false;
          break;
        }
        endSequenceIndex++;
      }

      if (matchedEndSequence) {
        end = i;
        break;
      }
    }

    if (start === -1) return files;

    const fileBuffer = buffer.subarray(start, end);
    const file = new File([fileBuffer], fileName, { type: fileType });

    return { [name]: file, ...files };
  }, {});

  try {
    body = JSON.parse(rawBody);
  } catch (error) {
    if (rawBody.includes(`name="`)) {
      body = (
        rawBody.match(/name="(.*?)"(\s|\n|\r)*(.*)(\s|\n|\r)*---/gm) || []
      ).reduce((fields: {}, field: string): { [name: string]: string } => {
        if (!/name="(.*?)"/.exec(field)?.[1]) return fields;

        return {
          ...fields,
          [/name="(.*?)"/.exec(field)?.[1] || ""]: field.match(
            /(.*?)(?=(\s|\n|\r)*---)/,
          )?.[0],
        };
      }, {});
    } else {
      body = Object.fromEntries(new URLSearchParams(rawBody));
    }
  }

  return { body, files };
}

export function parseQuery(url: string): Record<string, string> {
  if (!url.includes("?")) return {};

  return Object.fromEntries(new URLSearchParams(url.replace(/(.*)\?/, "")));
}

export function parseCookies(headers: Headers): Record<string, string> {
  const rawCookieString: string | null = headers.get("cookie");

  if (!rawCookieString) return {};

  return rawCookieString.split(";").reduce((cookies: {}, cookie: string): {
    [name: string]: string;
  } => {
    return {
      ...cookies,
      [cookie.split("=")[0].trimLeft()]: cookie.split("=")[1],
    };
  }, {});
}

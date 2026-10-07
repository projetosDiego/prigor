/** Salva a resposta de um fetch como arquivo, usando o nome enviado pelo servidor. */
import { filenameFromDisposition } from './filenames';

export async function saveResponseAsFile(res: Response, fallbackName: string): Promise<string> {
  const name = filenameFromDisposition(res.headers.get('content-disposition'), fallbackName);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return name;
}

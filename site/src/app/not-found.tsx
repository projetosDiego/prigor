import SiteLayout from './(site)/layout';
import SiteNotFound from './(site)/not-found';

/** URLs inexistentes também ganham cabeçalho, rodapé e caminhos de volta. */
export default function NotFound() {
  return (
    <SiteLayout>
      <SiteNotFound />
    </SiteLayout>
  );
}

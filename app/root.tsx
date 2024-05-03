import {
  type AppLoadContext,
  defer,
  type LinksFunction,
  type LoaderFunctionArgs,
  MetaArgs,
  type SerializeFrom,
} from '@shopify/remix-oxygen';
import type {ShouldRevalidateFunction} from '@remix-run/react';
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useMatches,
  useRouteError,
} from '@remix-run/react';
import type {SeoConfig} from '@shopify/hydrogen';
import {
  getSeoMeta,
  getShopAnalytics,
  UNSTABLE_Analytics as Analytics,
  useNonce,
} from '@shopify/hydrogen';
import {CustomAnalytics} from '~/components/CustomAnalytics';
import invariant from 'tiny-invariant';
import {withWeaverse} from '@weaverse/hydrogen';
import roboto400 from '@fontsource/roboto/400.css?url';
import roboto500 from '@fontsource/roboto/500.css?url';
import roboto700 from '@fontsource/roboto/700.css?url';

import {Layout} from '~/components';
import {seoPayload} from '~/lib/seo.server';

import {GenericError} from './components/GenericError';
import {NotFound} from './components/NotFound';
import styles from './styles/app.css?url';
import {DEFAULT_LOCALE, parseMenu} from './lib/utils';
import {GlobalStyle} from './weaverse/style';
import {GlobalLoading} from '~/components/global-loading';

// This is important to avoid re-fetching root queries on sub-navigations
export const shouldRevalidate: ShouldRevalidateFunction = ({
  formMethod,
  currentUrl,
  nextUrl,
}) => {
  // revalidate when a mutation is performed e.g add to cart, login...
  if (formMethod && formMethod !== 'GET') {
    return true;
  }

  // revalidate when manually revalidating via useRevalidator
  if (currentUrl.toString() === nextUrl.toString()) {
    return true;
  }

  return false;
};

export const links: LinksFunction = () => {
  return [
    {
      rel: 'stylesheet',
      href: roboto400,
    },
    {
      rel: 'stylesheet',
      href: roboto500,
    },
    {
      rel: 'stylesheet',
      href: roboto700,
    },
    {rel: 'stylesheet', href: styles},
    {
      rel: 'preconnect',
      href: 'https://cdn.shopify.com',
    },
    {
      rel: 'preconnect',
      href: 'https://shop.app',
    },
    {rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg'},
  ];
};
export const useRootLoaderData = () => {
  const [root] = useMatches();
  return root?.data as SerializeFrom<typeof loader>;
};

export async function loader({request, context}: LoaderFunctionArgs) {
  const {storefront, cart, env} = context;
  const layout = await getLayoutData(context);
  const isLoggedInPromise = context.customerAccount.isLoggedIn();

  const seo = seoPayload.root({shop: layout.shop, url: request.url});
  const googleGtmID = context.env.PUBLIC_GOOGLE_GTM_ID;
  return defer(
    {
      shop: getShopAnalytics({
        storefront: context.storefront,
        publicStorefrontId: env.PUBLIC_STOREFRONT_ID,
      }),
      consent: {
        checkoutDomain: env.PUBLIC_CHECKOUT_DOMAIN,
        storefrontAccessToken: env.PUBLIC_STOREFRONT_API_TOKEN,
      },
      isLoggedIn: isLoggedInPromise,
      layout,
      selectedLocale: storefront.i18n,
      cart: cart.get(),
      seo,
      weaverseTheme: await context.weaverse.loadThemeSettings(),
      googleGtmID,
    },
    {
      headers: {
        'Set-Cookie': await context.session.commit(),
      },
    },
  );
}

export const meta = ({data}: MetaArgs<typeof loader>) => {
  return getSeoMeta(data!.seo as SeoConfig);
};

function App() {
  const nonce = useNonce();
  const data = useLoaderData<typeof loader>();
  const locale = data.selectedLocale ?? DEFAULT_LOCALE;

  return (
    <html lang={locale.language}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
        <GlobalStyle />
      </head>
      <body>
        <Analytics.Provider
          cart={data.cart}
          shop={data.shop}
          consent={data.consent}
        >
          <Layout
            key={`${locale.language}-${locale.country}`}
            layout={data.layout}
          >
            <Outlet />
          </Layout>
          <CustomAnalytics />
        </Analytics.Provider>
        <GlobalLoading />
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default withWeaverse(App);

export function ErrorBoundary({error}: {error: Error}) {
  const nonce = useNonce();
  const routeError = useRouteError();
  const rootData = useRootLoaderData();
  const locale = rootData?.selectedLocale ?? DEFAULT_LOCALE;
  const isRouteError = isRouteErrorResponse(routeError);

  let title = 'Error';
  let pageType = 'page';

  if (isRouteError) {
    title = 'Not found';
    if (routeError.status === 404) pageType = routeError.data || pageType;
  }

  return (
    <html lang={locale.language}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{title}</title>
        <Meta />
        <Links />
      </head>
      <body>
        <Layout
          layout={rootData?.layout}
          key={`${locale.language}-${locale.country}`}
        >
          {isRouteError ? (
            <>
              {routeError.status === 404 ? (
                <NotFound type={pageType} />
              ) : (
                <GenericError
                  error={{message: `${routeError.status} ${routeError.data}`}}
                />
              )}
            </>
          ) : (
            <GenericError error={error instanceof Error ? error : undefined} />
          )}
        </Layout>
        {/*<ScrollRestoration nonce={nonce} />*/}
        {/*<Scripts nonce={nonce} />*/}
      </body>
    </html>
  );
}

const LAYOUT_QUERY = `#graphql
  query layout(
    $language: LanguageCode
    $headerMenuHandle: String!
    $footerMenuHandle: String!
  ) @inContext(language: $language) {
    shop {
      ...Shop
    }
    headerMenu: menu(handle: $headerMenuHandle) {
      ...Menu
    }
    footerMenu: menu(handle: $footerMenuHandle) {
      ...Menu
    }
  }
  fragment Shop on Shop {
    id
    name
    description
    primaryDomain {
      url
    }
    brand {
      logo {
        image {
          url
        }
      }
    }
  }
  fragment MenuItem on MenuItem {
    id
    resourceId
    tags
    title
    type
    url
  }
  fragment ChildMenuItem on MenuItem {
    ...MenuItem
  }
  fragment ParentMenuItem on MenuItem {
    ...MenuItem
    items {
      ...ChildMenuItem
    }
  }
  fragment Menu on Menu {
    id
    items {
      ...ParentMenuItem
    }
  }
` as const;

async function getLayoutData({storefront, env}: AppLoadContext) {
  const data = await storefront.query(LAYOUT_QUERY, {
    variables: {
      headerMenuHandle: 'main-menu',
      footerMenuHandle: 'footer',
      language: storefront.i18n.language,
    },
  });

  invariant(data, 'No data returned from Shopify API');

  /*
    Modify specific links/routes (optional)
    @see: https://shopify.dev/api/storefront/unstable/enums/MenuItemType
    e.g here we map:
      - /blogs/news -> /news
      - /blog/news/blog-post -> /news/blog-post
      - /collections/all -> /products
  */
  const customPrefixes = {CATALOG: 'products'};

  const headerMenu = data?.headerMenu
    ? parseMenu(
        data.headerMenu,
        data.shop.primaryDomain.url,
        env,
        customPrefixes,
      )
    : undefined;

  const footerMenu = data?.footerMenu
    ? parseMenu(
        data.footerMenu,
        data.shop.primaryDomain.url,
        env,
        customPrefixes,
      )
    : undefined;

  return {shop: data.shop, headerMenu, footerMenu};
}

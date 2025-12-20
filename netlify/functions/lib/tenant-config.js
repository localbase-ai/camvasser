// Tenant configuration - embedded directly for Netlify Functions bundling
const TENANT_CONFIG = {
  tenants: {
    budroofing: {
      name: "Bud Roofing",
      slug: "budroofing",
      domain: "budroofing.com",
      logo: "/logos/bud-roofing.png",
      phone: "855-661-7663",
      colors: {
        primary: "#FFC107",
        primaryHover: "#e6ac00"
      },
      companycam_api_token_env: "BUDROOFING_COMPANYCAM_TOKEN",
      og_image: "https://budroofing.com/bud-vector.png",
      page_title: "Bud Roofing - View Your Project Photos",
      page_subtitle: "Enter your address to view photos from your roofing project",
      heading: "View Your Project Photos",
      subheading: "Enter your address to see before, during, and after photos",
      flows: ['roof-claim-denial', 'roof-spray-vs-sealant-options', 'dirty-roof-costs', 'clogged-gutters-damage', 'ice-dam-prevention', 'photos']
    },
    kcroofrestoration: {
      name: "KC Roof Restoration",
      slug: "kcroofrestoration",
      domain: "kcroofrestoration.com",
      logo: "/logos/kcrr-badge.png",
      phone: "855-661-7663",
      colors: {
        primary: "#156ed7",
        primaryHover: "#1058b0"
      },
      companycam_api_token_env: "BUDROOFING_COMPANYCAM_TOKEN",
      og_image: "/logos/kcrr-badge.png",
      page_title: "KC Roof Restoration - View Your Project Photos",
      page_subtitle: "Enter your address to view photos from your roofing project",
      heading: "View Your Project Photos",
      subheading: "Enter your address to see before, during, and after photos",
      flows: ['roof-claim-denial', 'roof-spray-vs-sealant-options', 'dirty-roof-costs', 'clogged-gutters-damage', 'ice-dam-prevention', 'photos']
    }
  }
};

export function loadTenantConfig() {
  return TENANT_CONFIG;
}

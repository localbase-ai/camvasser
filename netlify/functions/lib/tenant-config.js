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
        primaryHover: "#FFB300",
        background: "#2c2c2c",
        logoBackground: "#2C2C2C"
      },
      companycam_api_token_env: "BUDROOFING_COMPANYCAM_TOKEN",
      page_title: "View Your Project Photos - Bud Roofing",
      page_subtitle: "Enter your address to view photos from your roofing project",
      heading: "View Your Photos",
      subheading: "Enter your address to view photos from your home.",
      og_image: "https://budroofing.com/bud-vector.png",
      flows: ['photos']
    },
    kcroofrestoration: {
      name: "KC Roof Restoration",
      slug: "kcroofrestoration",
      domain: "kcroofrestoration.com",
      logo: "/logos/kcrr-badge.png",
      phone: "855-661-7663",
      colors: {
        primary: "#156ed7",
        primaryHover: "#1058b0",
        background: "#31364c",
        logoBackground: "#31364c"
      },
      companycam_api_token_env: "BUDROOFING_COMPANYCAM_TOKEN",
      page_title: "View Your Project Photos - KC Roof Restoration",
      page_subtitle: "Enter your address to view photos from your roofing project",
      heading: "View Your Photos",
      subheading: "Enter your address to view photos from your home.",
      og_image: "/logos/kcrr-badge.png",
      flows: ['roof-claim-denial', 'roof-spray-vs-sealant-options', 'dirty-roof-costs', 'photos']
    }
  }
};

export function loadTenantConfig() {
  return TENANT_CONFIG;
}

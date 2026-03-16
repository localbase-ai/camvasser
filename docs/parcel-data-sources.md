# KC Metro Parcel Data Sources

ArcGIS parcel endpoints for the 10 counties around Kansas City. Used by `scripts/import-parcel-corridor.js` to fetch parcels inside storm corridors.

## Available (Free, Public REST API)

### Platte County, MO (in use)
- **URL:** `https://services2.arcgis.com/ji2hJlB9RmHn0um4/arcgis/rest/services/Platte_City_MO_Property_view/FeatureServer/1/query`
- **Parcels:** ~45,249
- **Notes:** Currently hardcoded in import scripts. Tested against kc-hail-2026-03-10 storm report.

### Jackson County, MO
- **URL:** `https://gis.mijackson.org/countygis/rest/services/RealEstate/RealEstateParcels/FeatureServer/0`
- **Parcels:** ~78,038
- **Max per request:** 2,000
- **Key fields:** `PIN`, `OWNER`, `OWNER2`, `O_ADDRESS`, `O_CITY`, `O_STATE`, `O_ZIP` (owner mailing), `P_FULLADD`, `P_CITY`, `P_ZIP` (property address), `P_ACREAGE`, `P_CLASS`, `LEGAL_DESC`
- **Auth:** None
- **Notes:** Updated weekly (Saturdays). Includes assessed/taxable value fields.

### Clay County, MO
- **URL:** `https://services7.arcgis.com/3c8lLdmDNevrTlaV/ArcGIS/rest/services/ClayCountyParcelService/FeatureServer/0`
- **Parcels:** ~98,112
- **Max per request:** 2,000
- **Key fields:** `parcel_id`, `prop_id`, `current_owner`, `situs_display` (property address), `owner_addr_1` (mailing), `acres_calc`, `legal_desc`, `tax_district`
- **Auth:** None

### Wyandotte County, KS (KCK / Unified Government)
- **URL:** `https://gisweb.wycokck.org/arcgis/rest/services/GISPUB/UGMAPS_4_V02/MapServer/0`
- **Parcels:** ~67,895
- **Max per request:** 2,000
- **Key fields:** `PARCEL`, `PARCEL_NBR`, `OWNER_NAME`, `ACRE`, `LAND_USE`, `STATE_ID`, `VACANT`, `CITY`, `ZIP`
- **Auth:** None
- **Open data portal:** https://yourdata-unifiedgov.opendata.arcgis.com/

## Token-Gated (IntegrityGIS)

These counties use IntegrityGIS — web viewers work but REST endpoints require auth tokens. Could contact county GIS departments for access.

| County | State | Web Viewer | Parcels |
|--------|-------|-----------|---------|
| Cass | MO | https://cassgis.integritygis.com/H5/Index.html | ? |
| Ray | MO | https://raygis.integritygis.com/H5/Index.html | ~16,102 |
| Lafayette | MO | https://lafayette.integritygis.com/ | ? |
| Leavenworth | KS | https://leavenworthgis.integritygis.com/ | ? |

## Not Available

### Johnson County, KS
- **Status:** Paid/secure only
- **Parcels:** ~220,000+ (largest suburban county)
- **Purchase:** http://ims.jocogov.org/ddr/ (per-parcel or per-section pricing)
- **Contact:** mapper@jocogov.org
- **Notes:** Free data at https://aims.jocogov.org/AIMSData/FreeData.aspx has boundaries/census/districts but NOT parcels.

### Miami County, KS
- **Status:** Web viewer only (Beacon/Schneider Corp)
- **Web viewer:** https://beacon.schneidercorp.com/?site=MiamiCountyKS
- **Notes:** No documented REST API.

## Possible Statewide Sources
- **Missouri MSDIS:** https://data-msdis.opendata.arcgis.com/
- **Kansas Geoportal:** https://hub.kansasgis.org/
- May have statewide parcel aggregations that cover the locked-down counties. Not yet confirmed.

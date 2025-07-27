# IEI-beta
Multi-Source Earthquake Monitor (MEM)
A web application to fetch, integrate, display, and visualize real-time and historical earthquake data from multiple international seismic agencies.

Overview
This software aggregates earthquake information from various sources like the Japan Meteorological Agency (JMA), USGS, EMSC, CWA (Taiwan), BMKG (Indonesia), CEA (China), ICL (China), and others. It provides a unified list view, map plotting, and 3D visualizations to give users a comprehensive overview of global seismic activity.

Key Features
Multi-Source Data Integration:
Real-time data via WebSocket:
JMA EEW (Japan)
SC EEW (Sichuan, China)
FJ EEW (Fujian, China)
CEA EEW (China)
ICL EEW (Chengdu Hi-tech, China)
CENC EEW (China)
EMSC (Euro-Med)
Periodic data fetching via HTTP:
JMA Earthquake Information (XML)
JMA Earthquake List (WebSocket/GeoJSON)
JMA Hypocenter Data (GeoJSON)
USGS Earthquake Data (GeoJSON)
EMSC Earthquake Data (GeoJSON)
CWA Earthquake Data (JSON - Taiwan)
BMKG Earthquake Data (XML - Indonesia)
BMKG M5.0+ Earthquake Data (XML - Indonesia)
Unified Display: Aggregates data from all sources into a single, chronological list. Toggle visibility of data from specific sources.
Interactive Map (Leaflet.js): Plots earthquake locations with markers. Customize marker visibility per source. Overlays tectonic plate boundaries.
3D Visualizations (Plotly.js):
Scatter plot showing latitude, longitude, and depth.
3D globe visualization of earthquakes.
Marker size represents magnitude.
Notification System: Browser notifications (with sound/vibration options) for significant earthquakes based on configurable magnitude thresholds.
Theme Support: Switch between Light Mode and Dark Mode.
Detailed Information: Click items in the list to view parsed details, including cached XML information.
Data Sources
WebSocket:
JMA EEW
SC EEW
FJ EEW
CEA EEW
ICL EEW
CENC EEW
EMSC
JMA Earthquake List
HTTP/XML/JSON/GeoJSON:
JMA Earthquake Information (XML Feed)
JMA Hypocenter Data (GeoJSON)
USGS (GeoJSON Feed)
EMSC (GeoJSON Feed)
CWA (JSON Feed - Taiwan)
BMKG (XML Feed - Indonesia)
BMKG M5.0+ (XML Feed - Indonesia)
Technologies Used
Frontend: HTML5, CSS3, JavaScript (Vanilla JS)
Libraries:
Leaflet.js (for interactive maps)
Plotly.js (for 3D graphs)
DOMParser (built-in browser API for XML parsing)
Data Formats: JSON, GeoJSON, XML
Communication: WebSocket (Real-time), HTTPS (HTTP GET)
Usage
Clone or download this repository.
Open index.html in a modern web browser.
Use the toggles on the 'Settings' tab to select which data sources to display.
View the integrated list on the 'Earthquake Info' tab.
Visualize data on the 'Map', '3D Graph', or '3D Sphere' tabs.
Configure notifications and theme settings on the 'Settings' tab.
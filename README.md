# MEM-beta
1. Overview
Name: Multi-Source Earthquake Monitor (MEM)
Purpose: To fetch real-time or periodic earthquake data from various international seismic agencies, unify the formats, and present them in an integrated list, on a map, and in 3D visualizations, allowing users to comprehensively grasp global seismic activity.
Target Users: Seismologists, disaster management personnel, and the general public interested in earthquake information.
2. Key Features
Multi-Source Data Integration:
WebSocket Connections: Receives real-time data from:
Japan Meteorological Agency Early Warning (JMA EEW)
Sichuan Earthquake Administration (SC EEW)
Fujian Earthquake Administration (FJ EEW)
China Earthquake Administration (CEA EEW)
China Earthquake Networks Center (CENC)
EMSC (Euro-Med)
HTTP Fetching:
Japan Meteorological Agency (JMA) Earthquake Information (XML format).
JMA Earthquake List (WebSocket/GeoJSON).
JMA Hypocenter Data (GeoJSON, past few days).
USGS Earthquake Data (GeoJSON/JSON).
Central Weather Administration (Taiwan, CWA) Earthquake Data (JSON).
BMKG (Indonesia) Earthquake Data (XML).
BMKG M5.0+ Earthquake Data.
Unified Display:
Converts data from all sources into a unified internal structure and displays them chronologically in a single list.
Allows toggling the display of data from specific sources on/off via switches.
Map Display:
Uses Leaflet.js to display an interactive map.
Plots earthquake locations with markers (including epicenter, magnitude, depth information).
Allows individual control over marker visibility for each data source.
Overlays tectonic plate boundaries on the map (using external GeoJSON data).
3D Visualization:
Uses Plotly.js to display earthquake locations (longitude, latitude, depth) in a 3D scatter plot.
Marker size varies based on magnitude.
Includes a 3D visualization plotting earthquakes on a spherical globe.
Notification System:
Alerts users via browser notifications for new earthquake information (especially above a magnitude threshold).
Categorizes notifications by level (Low/Medium/High) based on magnitude, changing notification sound, vibration pattern, and icon.
Optional audio notification feature.
Configurable notification magnitude threshold.
Duplicate notification prevention mechanism.
Theme Switching:
Allows switching between Light Mode and Dark Mode.
Settings are saved in browser local storage.
Detailed Information Display:
Clicking a list item displays detailed information (parsed from XML, etc.) in a side panel.
Includes caching for XML detail information.
3. Technology Stack
Frontend: HTML5, CSS3, JavaScript (Vanilla JS)
Libraries:
Map Display: Leaflet.js
Graphing: Plotly.js
XML Parsing: DOMParser (Browser built-in API)
Data Formats: JSON, GeoJSON, XML
Communication Protocols: WebSocket (Real-time), HTTPS (HTTP GET)
4. Usage
Open index.html in a web browser.
Use the checkboxes to select which data sources to fetch and display.
View the latest earthquake list chronologically on the "Integrated Earthquake Information" tab.
View earthquake locations on the map on the "Map" tab. Customize markers via display settings.
Visualize earthquake depth and distribution in 3D on the "3D Graph" tab.
Configure notifications, audio alerts, thresholds, and theme on the "Settings" tab.
5. Data Structure (Unified Internal Format)
Internally, data fetched from various sources is converted into a unified structure (or similar) and stored/managed in objects/arrays like combinedData or allData.

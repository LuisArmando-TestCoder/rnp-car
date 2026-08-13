# RNP Digital Scraper — Progressive Consultation Form & Navigation Spec

## Objective
Build a progressive, conditional form in the frontend that mirrors the RNP
Digital consultation form's sequential filling tree. The scraper navigates the
form based on the user's selections, and each stage emits user-understandable
logs in the frontend.

## 1. Consultation types (top-level)
The user picks one of:
- **Consulta de Vehículo** (vehicle consultation)
- **Consulta de Pólizas** (policy consultation)

## 2. Vehicle consultation sub-flow
When "Consulta de Vehículo" is selected, the user chooses a search mode:
- **Número de VIN** -> show a VIN input
- **Número de Placa** -> show a plate input + "clase de código" (code class) dropdown
- **Nombre** (optional) -> show a name input

The "clase de código" dropdown options MUST be extracted from the RNP form's
HTML and shown in the frontend (do not hardcode them).

## 3. Policy consultation sub-flow
When "Consulta de Pólizas" is selected, inspect the RNP HTML to map the policy
selection tree and show the corresponding fields in the frontend.

## 4. Search & result logic
- Search is performed WITHOUT the code class first (most cases are "CL").
- If MULTIPLE results appear -> the code class is required. Warn the user that
  multiple results appeared and ask them to set the code class.
- If EXACTLY ONE result -> that is the vehicle; proceed.
- If NO result -> warn the user.

## 5. Reuse previous VIN data
Use the data from the previously extracted VIN vehicle to pre-fill the plate
and vehicle type for subsequent searches.

## 6. Logging
Each stage and each variant emits distinct logs, shown in the frontend in plain,
user-understandable language that tells the user what is happening and what to
do next.

## 7. Scraper navigation tree
- Login -> **Consultas Gratuitas** (save point 1)
- -> **Consulta de Vehículo** form
- The form contains a "clase de código" selector.
- Read the HTML inner text and the HTML to determine what to click and which
  options exist.
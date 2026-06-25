# RawAquaWorld

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.1.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
# Remote Google Sheets catalogue

The shop now checks `/api/catalog` every 60 seconds and when the browser tab becomes active. If the remote API is unavailable or returns invalid data, the current `public/catalog.json` remains the safe fallback.

1. Use the native `RAW Aqua World Catalog` Google Sheet: `https://docs.google.com/spreadsheets/d/1G0d8WebI6X5WcMimI-ACtGa_L0z3wqpjVCZy13k2A5w/edit`. Keep the `Products`, `Profiles`, and `Media` tab names and column headings unchanged.
2. Create a Google Cloud service account with Google Sheets API access, then share the Sheet with its service-account email as a Viewer.
3. Copy the Sheet ID from its URL and add the values from `.env.example` under Netlify → Site configuration → Environment variables.
4. Keep `public/catalog-config.json` pointed to `/api/catalog`, or replace `remoteUrl` with the deployed API URL when the frontend and API use different domains.

The API reads the three tabs through the Google Sheets API, converts them into the existing nested catalogue shape, and caches valid results briefly. Google credentials are never shipped to the Angular browser bundle.

Netlify serves the catalogue through `/.netlify/functions/catalog`; `netlify.toml` maps the frontend's `/api/catalog` request to that function.

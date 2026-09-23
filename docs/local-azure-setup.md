# Local development and Azure setup

This guide uses PowerShell on Windows. Run commands from the repository root unless a step says otherwise.

## Required Azure services

Full functionality requires these Azure services and deployments:

| Area | Azure service | Created by this repo? | Required for |
| --- | --- | --- | --- |
| Frontend hosting | Azure Static Web Apps Standard | Yes, `infra/main.bicep` | Browser app hosting and linked API routing |
| API hosting | Azure Static Web Apps managed Functions | Yes, deployed from `api/` by Static Web Apps | `/api/health`, `/api/review-message`, `/api/generate-background`, `/api/submit-card` |
| Card storage | Azure Storage account and private Blob container | Yes, `infra/main.bicep` | Submitted JPG storage, idempotency markers, retention policy |
| Monitoring | Application Insights and Log Analytics | Yes, `infra/main.bicep` | Availability, failures, latency, privacy-safe operational telemetry |
| Text review model | Azure OpenAI / Foundry chat deployment | No | Optional AI message review |
| Image generation model | Azure OpenAI / Foundry image deployment | No | Optional AI background generation |
| Text safety | Azure AI Content Safety | No | Prompt/message safety screening |
| Generated-image policy | Custom image moderation HTTP service | No | Required before enabling AI image generation |
| Deployment identity | GitHub Actions OIDC service principal or local Azure CLI account | No | Bicep deployment and code publishing |

The app can run without AI image generation while the moderation service is missing. Set `VITE_AI_IMAGE_ENABLED=false` until that service is deployed, tested, and approved.

## What gets deployed

`infra/main.bicep` creates these resources:

- Azure Static Web Apps Standard with managed Functions from the `api/` folder
- A private Storage account and `cards` Blob container
- A Blob lifecycle policy for the approved retention period
- Application Insights and Log Analytics
- Function app settings for server-side Azure service keys and the storage connection string

The template does **not** create model deployments, Azure AI Content Safety, or the custom image-policy moderation service. Create those separately before enabling the corresponding AI features.

| Capability | Required resource | Required API setting |
| --- | --- | --- |
| Card storage | Azure Blob Storage | `STORAGE_CONNECTION_STRING` |
| Message review | Azure OpenAI chat model | `AI_REVIEW_ENDPOINT`, `AI_API_KEY` |
| Prompt/output text safety | Azure AI Content Safety | `CONTENT_SAFETY_ENDPOINT`, `CONTENT_SAFETY_KEY` |
| Background generation | Azure OpenAI DALL-E-3-compatible deployment | `AI_IMAGE_ENDPOINT`, `AI_API_KEY` |
| Generated-image policy | Custom moderation endpoint | `IMAGE_MODERATION_ENDPOINT`, `IMAGE_MODERATION_KEY` |

> Azure AI Content Safety checks image harm categories, but it does not satisfy all of this application's required checks for text, logos, recognizable characters, identifiable people, and medical imagery. Do not enable AI image generation until the custom moderation endpoint is deployed and approved.

## 1. Install prerequisites

Install:

- Git
- Node.js 22 LTS
- Azure CLI
- Azure Functions Core Tools v4
- Azurite

Verify the tools:

```powershell
node --version
npm --version
az version
func --version
azurite --version
```

Install dependencies and create ignored local configuration files:

```powershell
npm ci
npm ci --prefix api
Copy-Item .env.example .env.local
Copy-Item api/local.settings.example.json api/local.settings.json
```

Never commit `.env.local`, `api/local.settings.json`, deployment tokens, keys, or connection strings.

## 2. Run without Azure

AI remains disabled in `.env.local`. Start Azurite in terminal 1:

```powershell
azurite --silent --location .azurite
```

Start Functions in terminal 2:

```powershell
npm run start --prefix api
```

Start Vite in terminal 3:

```powershell
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to Functions at `http://localhost:7071`.

Verify the API and storage flow:

```powershell
Invoke-RestMethod http://localhost:7071/api/health
```

The response should be `status: healthy`. The API creates the private Azurite `cards` container on the first submission. Inspect it with Azure Storage Explorer using its local emulator connection.

## 3. Create Azure AI resources

Choose names and sign in:

```powershell
$subscriptionId = '<subscription-id>'
$resourceGroup = 'rg-rmh-ecard-dev'
$location = '<region-supporting-your-approved-models>'
$openAiName = '<globally-unique-openai-name>'
$contentSafetyName = '<globally-unique-content-safety-name>'
$reviewDeployment = '<approved-chat-deployment-name>'
$imageDeployment = '<approved-dall-e-3-compatible-deployment-name>'

az login
az account set --subscription $subscriptionId
az group create --name $resourceGroup --location $location

@(
  'Microsoft.CognitiveServices',
  'Microsoft.Web',
  'Microsoft.Storage',
  'Microsoft.Insights',
  'Microsoft.OperationalInsights'
) | ForEach-Object { az provider register --namespace $_ }
```

Create the accounts:

```powershell
az cognitiveservices account create `
  --name $openAiName `
  --resource-group $resourceGroup `
  --location $location `
  --kind OpenAI `
  --sku S0 `
  --custom-domain $openAiName

az cognitiveservices account create `
  --name $contentSafetyName `
  --resource-group $resourceGroup `
  --location $location `
  --kind ContentSafety `
  --sku S0 `
  --custom-domain $contentSafetyName
```

In Microsoft Foundry, deploy:

1. An approved chat model that supports chat completions and JSON output for message review.
2. An approved image model that supports the Azure OpenAI image generations REST contract used by this code. The current request uses `1536x1024`, `quality: medium`, and reads `data[0].b64_json` from the response.

Model names, versions, capacity, and region availability change. Select approved deployments in the portal rather than copying an unverified model version into automation. Record both deployment names.

Build the full REST URLs expected by the API:

```powershell
$openAiEndpoint = az cognitiveservices account show `
  --name $openAiName `
  --resource-group $resourceGroup `
  --query properties.endpoint `
  --output tsv

$contentSafetyEndpoint = az cognitiveservices account show `
  --name $contentSafetyName `
  --resource-group $resourceGroup `
  --query properties.endpoint `
  --output tsv

$reviewEndpoint = "${openAiEndpoint}openai/deployments/$reviewDeployment/chat/completions?api-version=2024-10-21"
$imageEndpoint = "${openAiEndpoint}openai/deployments/$imageDeployment/images/generations?api-version=2024-02-01"
```

If the selected deployment uses a different generally available API version or request contract, update and test `api/src/ai.ts` and the corresponding Function before enabling it.

## 4. Create or connect the image moderation service

AI image generation must stay disabled until `IMAGE_MODERATION_ENDPOINT` and `IMAGE_MODERATION_KEY` point to an approved service. This repository does not currently implement or deploy that service.

The service must expose an HTTPS `POST` endpoint and enforce this contract:

```http
POST <IMAGE_MODERATION_ENDPOINT>
x-api-key: <IMAGE_MODERATION_KEY>
content-type: application/json
```

```json
{
  "imageBase64": "<base64-png-from-image-generation>",
  "checks": ["harm", "text", "logo", "recognizable-character", "identifiable-person", "medical-imagery"]
}
```

It must return:

```json
{
  "safe": true,
  "accessibleDescription": "Approved alt text for the generated background."
}
```

Use `safe: false` or a non-2xx response when any required check fails or cannot complete. Fail closed.

Recommended Azure deployment shape for this missing service:

1. Create a separate Azure Function App or Azure Container App with HTTPS only.
2. Store its API key in app settings or Key Vault; never send it to the browser.
3. Use Azure AI Content Safety image analysis for harm categories.
4. Use an approved image/text analysis approach for text, logos, recognizable characters, identifiable people, and medical imagery. If your organization has an approved Responsible AI moderation service, use that instead of building a new one.
5. Return an approved `accessibleDescription` only after all checks pass.
6. Add operational telemetry that records status, duration, and request IDs only. Do not log image payloads.
7. Load-test and red-team it before setting `VITE_AI_IMAGE_ENABLED=true`.

After deployment, record:

```powershell
$imageModerationEndpoint = 'https://<moderation-service-host>/<route>'
$imageModerationKey = '<moderation-service-api-key>'
```

For development before the service exists, leave these empty and keep image generation disabled.

## 5. Retrieve service keys

Retrieve the Azure OpenAI and Content Safety keys for local settings and secure deployment parameters:

```powershell
$openAiKey = az cognitiveservices account keys list `
  --name $openAiName `
  --resource-group $resourceGroup `
  --query key1 `
  --output tsv

$contentSafetyKey = az cognitiveservices account keys list `
  --name $contentSafetyName `
  --resource-group $resourceGroup `
  --query key1 `
  --output tsv
```

Keep these values only in ignored local settings, secure deployment parameters, GitHub environment secrets, or Key Vault references. Rotate them according to your approved operations process.

## 6. Run locally with Azure AI

Keep `AzureWebJobsStorage` and `STORAGE_CONNECTION_STRING` pointed at Azurite. In `api/local.settings.json`, set:

```json
{
  "AI_REVIEW_ENDPOINT": "<full chat-completions URL>",
  "AI_IMAGE_ENDPOINT": "<full image-generations URL>",
  "AI_API_KEY": "<azure-openai-key>",
  "CONTENT_SAFETY_ENDPOINT": "https://<content-safety-name>.cognitiveservices.azure.com",
  "CONTENT_SAFETY_KEY": "<content-safety-key>",
  "IMAGE_MODERATION_ENDPOINT": "<approved custom moderation URL>",
  "IMAGE_MODERATION_KEY": "<approved custom moderation key>"
}
```

In `.env.local`, enable only the capabilities whose complete dependency chain is configured:

```dotenv
VITE_AI_REVIEW_ENABLED=true
VITE_AI_IMAGE_ENABLED=false
```

Message review requires the chat deployment and Content Safety. Image generation additionally requires the image deployment and custom image-policy endpoint.

Restart Functions after changing settings, then restart Vite after changing `.env.local`.

## 7. Deploy the application infrastructure

Copy `infra/example.parameters.json` to an ignored environment-specific file such as `infra/dev.parameters.json`. Replace every placeholder. Use an approved integer retention period and initially use an empty `allowedOrigins` array while obtaining the generated Static Web App hostname.

The API is deployed as Azure Static Web Apps managed Functions. No separate Function App, App Service plan, `Y1`, or `B1` quota is required.

Add these optional AI parameters when enabling AI:

```json
"aiReviewEnabled": { "value": true },
"aiImageEnabled": { "value": false },
"aiReviewEndpoint": { "value": "<full chat-completions URL>" },
"aiImageEndpoint": { "value": "<full image-generations URL>" },
"aiApiKey": { "value": "<azure-openai-key>" },
"contentSafetyEndpoint": { "value": "<content-safety-base-endpoint>" },
"contentSafetyKey": { "value": "<content-safety-key>" },
"imageModerationEndpoint": { "value": "<custom-moderation-url>" },
"imageModerationKey": { "value": "<custom-moderation-key>" },
"aiReviewDeploymentName": { "value": "<chat-deployment-name>" },
"aiImageDeploymentName": { "value": "<image-deployment-name>" }
```

For a deployment without image generation, use:

```json
"aiReviewEnabled": { "value": true },
"aiImageEnabled": { "value": false },
"imageModerationEndpoint": { "value": "" },
"imageModerationKey": { "value": "" }
```

For full functionality, `aiImageEnabled` and `VITE_AI_IMAGE_ENABLED` must both be `true`, and `aiImageEndpoint`, `aiApiKey`, `contentSafetyEndpoint`, `contentSafetyKey`, `imageModerationEndpoint`, and `imageModerationKey` must all be populated.

Validate and deploy:

```powershell
az bicep build --file infra/main.bicep
az deployment group validate `
  --resource-group $resourceGroup `
  --template-file infra/main.bicep `
  --parameters '@infra/dev.parameters.json'

$deploymentName = "rmh-ecard-dev-$(Get-Date -Format yyyyMMddHHmmss)"
az deployment group create `
  --name $deploymentName `
  --resource-group $resourceGroup `
  --template-file infra/main.bicep `
  --parameters '@infra/dev.parameters.json'

$staticWebAppName = az deployment group show `
  --name $deploymentName --resource-group $resourceGroup `
  --query properties.outputs.staticWebAppResourceName.value --output tsv
$staticHostname = az deployment group show `
  --name $deploymentName --resource-group $resourceGroup `
  --query properties.outputs.staticWebAppHostname.value --output tsv
$storageAccountName = az deployment group show `
  --name $deploymentName --resource-group $resourceGroup `
  --query properties.outputs.storageAccountName.value --output tsv
```

Replace `allowedOrigins` in `infra/dev.parameters.json` with `https://$staticHostname`, then rerun `az deployment group create` so browser and Function CORS match the deployed site.

## 8. Build and deploy code

Build with the production feature flags and approved content. PowerShell environment variables apply to the Vite build:

```powershell
$env:VITE_AI_REVIEW_ENABLED = 'true'
$env:VITE_AI_IMAGE_ENABLED = 'false'
$env:VITE_CONSENT_VERSION = '<approved-consent-version>'
$env:VITE_APPROVED_FOOTER_TEXT = '<approved-footer-text>'

npm run check
npm run check:api
npm run build
npm run build --prefix api
```

Deploy the prebuilt Vite output and the managed Functions API from `api/`. The token is held only in a process variable:

```powershell
$deploymentToken = az staticwebapp secrets list `
  --name $staticWebAppName `
  --resource-group $resourceGroup `
  --query properties.apiKey `
  --output tsv

npx --yes @azure/static-web-apps-cli deploy ./dist `
  --deployment-token $deploymentToken `
  --api-location api `
  --env production

Remove-Variable deploymentToken
```

For repeat deployments, prefer the existing GitHub Actions workflow with OIDC and environment approvals. Configure all variables referenced by `.github/workflows/deploy.yml`; never store the Static Web Apps deployment token as a repository variable.

For GitHub Actions deployments, configure these environment secrets when the corresponding feature is enabled:

| Secret | Required when |
| --- | --- |
| `AI_API_KEY` | AI review or AI image generation is enabled |
| `CONTENT_SAFETY_KEY` | AI review or AI image generation is enabled |
| `IMAGE_MODERATION_KEY` | AI image generation is enabled |
| `STATIC_WEB_APP_DEPLOYMENT_TOKEN` | Static Web Apps upload is used |

Configure these environment variables:

| Variable | Purpose |
| --- | --- |
| `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | GitHub OIDC Azure login |
| `AZURE_RESOURCE_GROUP` | Target resource group |
| `DEPLOYMENT_ENVIRONMENT` | `dev`, `test`, or `prod` |
| `STATIC_WEB_APP_NAME` | Static Web App resource name |
| `RETENTION_DAYS`, `CONSENT_VERSION`, `BLOB_PATH_PREFIX`, `APPROVED_FOOTER_TEXT`, `ALLOWED_ORIGINS_JSON` | App configuration |

If you deploy locally, pass secure parameters in an ignored parameters file or with command-line parameters. Do not commit real keys.

## 9. Verify the deployed environment

```powershell
Invoke-RestMethod "https://$staticHostname/api/health"
az storage container show `
  --account-name $storageAccountName `
  --name cards `
  --auth-mode key
```

Then verify in the browser:

1. The approved catalog works with AI unavailable.
2. Message review accepts safe text and blocks known unsafe/PII test cases.
3. Image generation remains hidden unless every moderation dependency is enabled.
4. A card submission returns a submission ID and creates a non-public Blob.
5. A duplicate submission with the same idempotency key returns the same result or a pending conflict.
6. Application Insights contains status, duration, and request IDs, but no message, prompt, image, card body, direct Blob URL, or raw IP.
7. Storage lifecycle management matches the approved retention period.

Verify AI endpoints directly from the deployed site:

```powershell
$reviewBody = @{ message = 'Wishing you comfort and encouragement today.'; language = 'en'; action = 'review' } | ConvertTo-Json
Invoke-RestMethod "https://$staticHostname/api/review-message" `
  -Method Post `
  -ContentType 'application/json' `
  -Body $reviewBody
```

Only run this image-generation smoke test after the moderation service is deployed and `VITE_AI_IMAGE_ENABLED=true` was used for the frontend build:

```powershell
$imageBody = @{ description = 'warm abstract sunshine with open message space'; stylePreset = 'warm'; locale = 'en' } | ConvertTo-Json
Invoke-RestMethod "https://$staticHostname/api/generate-background" `
  -Method Post `
  -ContentType 'application/json' `
  -Body $imageBody
```

The image endpoint should return `status: generated`, an `imageDataUrl`, and an `accessibleDescription`. If the moderation service is missing, it should return the friendly "AI image generation is not configured" message.

Run the automated checks:

```powershell
npm run check
npm run check:api
npx playwright install chromium
npm run test:e2e
```

## 10. Disable or clean up

Disable an AI feature by setting its Vite flag to `false`, rebuilding the frontend, and clearing or disabling the corresponding Function settings. Keep the approved catalog workflow available.

Delete the development resource group only after confirming no submitted cards must be retained:

```powershell
az group delete --name $resourceGroup --yes --no-wait
```

Do not use resource-group deletion as a production rollback. Follow `docs/operations-runbook.md` so card retention and incident requirements are preserved.

## Official references

- [Azure OpenAI image generation](https://learn.microsoft.com/azure/ai-foundry/openai/dall-e-quickstart)
- [Azure AI Content Safety text quickstart](https://learn.microsoft.com/azure/ai-services/content-safety/quickstart-text)
- [Azure AI Content Safety image quickstart](https://learn.microsoft.com/azure/ai-services/content-safety/quickstart-image)
- [Link an existing API to Static Web Apps](https://learn.microsoft.com/azure/static-web-apps/apis-functions)

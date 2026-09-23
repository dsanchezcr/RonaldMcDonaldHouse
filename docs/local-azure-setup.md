# Local development and Azure setup

This guide uses PowerShell on Windows. Run commands from the repository root unless a step says otherwise.

## Required Azure services

Full functionality requires these Azure services and deployments:

| Area | Azure service | Created by this repo? | Required for |
| --- | --- | --- | --- |
| Frontend hosting | Azure Static Web Apps Standard | Yes, `infra/main.bicep` | Browser app hosting and pull-request previews |
| API hosting | Linux Azure Function App on Flex Consumption | Yes, `infra/main.bicep`, deployed from `api/` by GitHub Actions | `/api/health`, `/api/review-message`, `/api/generate-background`, `/api/moderate-image`, `/api/submit-card` |
| Card storage | Azure Storage account and private Blob container | Yes, `infra/main.bicep` | Submitted JPG storage, idempotency markers, retention policy |
| Monitoring | Application Insights and Log Analytics | Yes, `infra/main.bicep` | Availability, failures, latency, privacy-safe operational telemetry |
| Text review model | Azure OpenAI / Foundry chat deployment | No | Optional AI message review |
| Image generation model | Azure OpenAI / Foundry image deployment | No | Optional AI background generation |
| Text safety | Azure AI Content Safety | No | Prompt/message safety screening |
| Generated-image policy | Dedicated Function App `/api/moderate-image` plus Azure AI Content Safety image analysis | Yes, code is in this repo | Required before enabling AI image generation |
| App deployment | Static Web Apps token and Azure OIDC identity | No | GitHub Actions deploys the frontend and dedicated Function App separately |
| Infrastructure deployment | Local Azure CLI account or reviewed deployment identity | No | Bicep deployment only when resources must be created or updated |

The app can run without AI image generation by setting `VITE_AI_IMAGE_ENABLED=false`. When image generation is enabled, `/api/moderate-image` must also be configured with `IMAGE_MODERATION_KEY` and Content Safety settings.

## What gets deployed

`infra/main.bicep` creates these resources:

- Azure Static Web Apps Standard for the frontend
- Linux Flex Consumption (`FC1`) Function App for the `api/` folder
- A private Storage account and `cards` Blob container
- A Blob lifecycle policy for the approved retention period
- Application Insights and Log Analytics
- Function App settings for server-side Azure service keys and the storage connection string

The template does **not** create model deployments or Azure AI Content Safety. Create those separately before enabling the corresponding AI features. The image moderation endpoint is implemented in this repo and deployed as part of the managed API.

| Capability | Required resource | Required API setting |
| --- | --- | --- |
| Card storage | Azure Blob Storage | `STORAGE_CONNECTION_STRING` |
| Message review | Azure OpenAI chat model | `AI_REVIEW_ENDPOINT`, `AI_API_KEY` |
| Prompt/output text safety | Azure AI Content Safety | `CONTENT_SAFETY_ENDPOINT`, `CONTENT_SAFETY_KEY` |
| Background generation | Azure OpenAI DALL-E-3-compatible deployment | `AI_IMAGE_ENDPOINT`, `AI_API_KEY` |
| Generated-image policy | `/api/moderate-image` Function App endpoint | `IMAGE_MODERATION_ENDPOINT`, `IMAGE_MODERATION_KEY` |

> Azure AI Content Safety checks image harm categories. The in-repo moderation endpoint wraps that check and fails closed, but additional approved checks may still be required before production for text, logos, recognizable characters, identifiable people, and medical imagery.

## 1. Install prerequisites

Install:

- Git
- Node.js 22 LTS
- Azure CLI
- Azure Functions Core Tools v4
- Azurite, only if you need offline storage testing

Verify the required tools:

```powershell
node --version
npm --version
az version
func --version
```

If you plan to run the optional offline storage path, also verify Azurite:

```powershell
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

## 2. Run locally with Azure services

Populate `api/local.settings.json` with the Azure Storage connection string and Azure AI settings described later in this guide. Use `http://localhost:7071/api/moderate-image` for `IMAGE_MODERATION_ENDPOINT` while Functions runs locally.

Start Functions in terminal 1:

```powershell
npm run start --prefix api
```

Start Vite in terminal 2:

```powershell
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to Functions at `http://localhost:7071`.

Verify the API and Azure-backed storage flow:

```powershell
Invoke-RestMethod http://localhost:7071/api/health
```

The response should be `status: healthy`. On first submission, the API writes to the configured Azure Storage `cards` container using the server-side connection string.

### Optional offline storage mode

If you need to test without Azure Storage, keep AI disabled, set `AzureWebJobsStorage` and `STORAGE_CONNECTION_STRING` to Azurite in `api/local.settings.json`, and start Azurite before Functions:

```powershell
azurite --silent --location .azurite
```

Azurite is only an offline development fallback. It is not the preferred parity path for this app.

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

## 4. Configure the image moderation endpoint

AI image generation requires `IMAGE_MODERATION_ENDPOINT` and `IMAGE_MODERATION_KEY`. This repository implements the endpoint as `POST /api/moderate-image`; it is deployed with the Static Web Apps managed API.

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

Generate a strong shared secret for local and cloud settings:

```powershell
$imageModerationKey = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

For local testing use:

```powershell
$imageModerationEndpoint = 'http://localhost:7071/api/moderate-image'
```

For the dedicated Function App in cloud, Bicep defaults this endpoint to the Function App hostname:

```powershell
$imageModerationEndpoint = 'https://<function-app-name>.azurewebsites.net/api/moderate-image'
```

Store `IMAGE_MODERATION_KEY` only in ignored local settings, Static Web Apps app settings, GitHub secrets, or Key Vault references. Never expose it to the browser.

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

For Azure-backed local testing, point `AzureWebJobsStorage` and `STORAGE_CONNECTION_STRING` at the Azure Storage account connection string. In `api/local.settings.json`, set:

```json
{
  "AI_REVIEW_ENDPOINT": "<full chat-completions URL>",
  "AI_IMAGE_ENDPOINT": "<full image-generations URL>",
  "AI_API_KEY": "<azure-openai-key>",
  "CONTENT_SAFETY_ENDPOINT": "https://<content-safety-name>.cognitiveservices.azure.com",
  "CONTENT_SAFETY_KEY": "<content-safety-key>",
  "IMAGE_MODERATION_ENDPOINT": "http://localhost:7071/api/moderate-image",
  "IMAGE_MODERATION_KEY": "<image-moderation-key>"
}
```

In `.env.local`, enable only the capabilities whose complete dependency chain is configured:

```dotenv
VITE_AI_REVIEW_ENABLED=true
VITE_AI_IMAGE_ENABLED=false
```

Message review requires the chat deployment and Content Safety. Image generation additionally requires the image deployment and image moderation endpoint.

Restart Functions after changing settings, then restart Vite after changing `.env.local`.

## 7. Deploy the application infrastructure

If the resource group, Static Web App, Storage account, Application Insights, and app settings already exist, skip this section and use the app-only workflow in [Build and deploy code](#8-build-and-deploy-code).

Copy `infra/example.parameters.json` to an ignored environment-specific file such as `infra/dev.parameters.json`. Replace every placeholder. Use an approved integer retention period and initially use an empty `allowedOrigins` array while obtaining the generated Static Web App hostname.

The API is deployed as a dedicated Linux Flex Consumption Function App. This is the current serverless Consumption option; it replaces the managed Static Web Apps API and does not require an App Service plan tier such as `B1` or `Y1`.

Add these optional AI parameters when enabling AI:

```json
"aiReviewEnabled": { "value": true },
"aiImageEnabled": { "value": false },
"aiReviewEndpoint": { "value": "<full chat-completions URL>" },
"aiImageEndpoint": { "value": "<full image-generations URL>" },
"aiApiKey": { "value": "<azure-openai-key>" },
"contentSafetyEndpoint": { "value": "<content-safety-base-endpoint>" },
"contentSafetyKey": { "value": "<content-safety-key>" },
"imageModerationEndpoint": { "value": "https://<function-app-name>.azurewebsites.net/api/moderate-image" },
"imageModerationKey": { "value": "<image-moderation-key>" },
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
$functionAppName = az deployment group show `
  --name $deploymentName --resource-group $resourceGroup `
  --query properties.outputs.functionAppName.value --output tsv
$functionAppUrl = az deployment group show `
  --name $deploymentName --resource-group $resourceGroup `
  --query properties.outputs.functionAppUrl.value --output tsv
```

Set the GitHub variable `VITE_API_BASE_URL` to `$functionAppUrl`. Set `allowedOrigins` to the production Static Web App hostname; the template also permits Static Web Apps preview hostnames without credentials.

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

Deploy the Function App first. Configure a GitHub OpenID Connect identity with the `Website Contributor` role scoped to the Function App, then add these GitHub **secrets**: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`. Add `AZURE_FUNCTIONAPP_NAME` and `VITE_API_BASE_URL` as GitHub **variables**. The workflow performs the Function deployment after validation.

`infra/main.bicep` creates the scoped GitHub OIDC identity and federation rule for the `production` environment. After deployment, create these GitHub repository settings:

| Type | Name | Source |
| --- | --- | --- |
| Secret | `AZURE_CLIENT_ID` | `githubDeploymentClientId` Bicep output |
| Secret | `AZURE_TENANT_ID` | Microsoft Entra tenant ID |
| Secret | `AZURE_SUBSCRIPTION_ID` | Subscription containing the Function App |
| Variable | `AZURE_FUNCTIONAPP_NAME` | `functionAppName` Bicep output |
| Variable | `VITE_API_BASE_URL` | `functionAppUrl` Bicep output, without a trailing slash |

The OIDC identity is trusted only for `dsanchezcr/RonaldMcDonaldHouse` deployments using the GitHub `production` environment. It has `Website Contributor` on the Function App only.

For a one-time local Function deployment after Bicep provisioning, use Azure Functions Core Tools while authenticated to the target subscription:

```powershell
Push-Location api
func azure functionapp publish $functionAppName --typescript --build remote
Pop-Location
```

Deploy the prebuilt Vite output separately. The token is held only in a process variable:

```powershell
$deploymentToken = az staticwebapp secrets list `
  --name $staticWebAppName `
  --resource-group $resourceGroup `
  --query properties.apiKey `
  --output tsv

npx --yes @azure/static-web-apps-cli deploy ./dist `
  --deployment-token $deploymentToken `
  --env production

Remove-Variable deploymentToken
```

For repeat app deployments, use the GitHub Actions workflow. It does not redeploy the resource group; it builds/tests, then deploys production on `main` and preview environments for pull requests.

For GitHub Actions deployments, configure these environment secrets when the corresponding feature is enabled:

| Secret | Required when |
| --- | --- |
| `STATIC_WEB_APP_DEPLOYMENT_TOKEN` | Static Web Apps upload is used |
| `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | OIDC deployment to the dedicated Function App |

Configure these environment variables:

| Variable | Purpose |
| --- | --- |
| `AZURE_FUNCTIONAPP_NAME` | Dedicated Function App resource name |
| `VITE_API_BASE_URL` | Dedicated Function App HTTPS origin, without `/api` suffix |
| `AI_REVIEW_ENABLED`, `AI_IMAGE_ENABLED`, `CONSENT_VERSION`, `APPROVED_FOOTER_TEXT` | Vite build-time app configuration |

If you deploy locally, pass secure parameters in an ignored parameters file or with command-line parameters. Do not commit real keys.

## 9. Verify the deployed environment

```powershell
Invoke-RestMethod "$functionAppUrl/api/health"
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
Invoke-RestMethod "$functionAppUrl/api/review-message" `
  -Method Post `
  -ContentType 'application/json' `
  -Body $reviewBody
```

Only run this image-generation smoke test after `VITE_AI_IMAGE_ENABLED=true` was used for the frontend build and the moderation endpoint/key are configured:

```powershell
$imageBody = @{ description = 'warm abstract sunshine with open message space'; stylePreset = 'warm'; locale = 'en' } | ConvertTo-Json
Invoke-RestMethod "$functionAppUrl/api/generate-background" `
  -Method Post `
  -ContentType 'application/json' `
  -Body $imageBody
```

The image endpoint should return `status: generated`, an `imageDataUrl`, and an `accessibleDescription`. If moderation settings are missing, it should return the friendly "AI image generation is not configured" message.

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

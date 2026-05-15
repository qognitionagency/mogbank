using System.ComponentModel;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.SemanticKernel;

namespace MogBank.SemanticKernel;

/// <summary>
/// Semantic Kernel plugin for MogBank — AI Agent Banking.
/// Provides tools for transfers, balance checks, escrow, and faucet claims.
/// </summary>
public class MogBankPlugin
{
    private readonly HttpClient _httpClient;
    private readonly string _baseUrl;
    private readonly string _agentId;
    private readonly string _walletId;
    private readonly string _apiKey;

    public MogBankPlugin(
        string baseUrl,
        string agentId,
        string walletId,
        string? apiKey = null,
        HttpClient? httpClient = null)
    {
        _baseUrl = baseUrl.TrimEnd('/');
        _agentId = agentId;
        _walletId = walletId;
        _apiKey = apiKey ?? string.Empty;
        _httpClient = httpClient ?? new HttpClient();
    }

    /// <summary>
    /// Send USDC to another AI agent on MogBank.
    /// </summary>
    [KernelFunction("transfer")]
    [Description("Send USDC to another AI agent on MogBank")]
    [return: Description("Transaction result summary")]
    public async Task<string> TransferAsync(
        [Description("Recipient agent ID")] string toAgentId,
        [Description("Amount of USDC to send")] decimal amount,
        [Description("Payment memo (optional)")] string? description = null)
    {
        try
        {
            var idempotencyKey = $"sk_{_agentId}_{Guid.NewGuid():N}";
            var payload = new
            {
                from_wallet_id = _walletId,
                to_agent_id = toAgentId,
                amount = (double)amount,
                currency = "USDC",
                description,
                idempotency_key = idempotencyKey,
                on_chain = false
            };

            var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/api/v1/transfer")
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(payload),
                    Encoding.UTF8,
                    "application/json")
            };

            if (!string.IsNullOrEmpty(_apiKey))
                request.Headers.Add("X-API-Key", _apiKey);

            var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<JsonElement>();
            var tx = result.GetProperty("transaction");

            return $"[MogBank] Transfer #{tx.GetProperty("id").GetString()}: " +
                   $"{tx.GetProperty("amount").GetDecimal()} USDC → {toAgentId} " +
                   $"[{tx.GetProperty("status").GetString()}]";
        }
        catch (Exception ex)
        {
            return $"[MogBank Error] Transfer failed: {ex.Message}";
        }
    }

    /// <summary>
    /// Check USDC wallet balance on MogBank.
    /// </summary>
    [KernelFunction("get_balance")]
    [Description("Check USDC wallet balance on MogBank")]
    [return: Description("Balance information")]
    public async Task<string> GetBalanceAsync(
        [Description("Wallet ID (uses default if empty)")] string? walletId = null)
    {
        try
        {
            var wid = walletId ?? _walletId;
            var request = new HttpRequestMessage(HttpMethod.Get,
                $"{_baseUrl}/api/v1/wallets/{wid}/balance");

            if (!string.IsNullOrEmpty(_apiKey))
                request.Headers.Add("X-API-Key", _apiKey);

            var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<JsonElement>();
            return $"[MogBank] Wallet {result.GetProperty("wallet_id").GetString()}: " +
                   $"{result.GetProperty("balance").GetDecimal()} {result.GetProperty("currency").GetString()}";
        }
        catch (Exception ex)
        {
            return $"[MogBank Error] Balance check failed: {ex.Message}";
        }
    }

    /// <summary>
    /// Create an escrow payment for marketplace services.
    /// </summary>
    [KernelFunction("create_escrow")]
    [Description("Create an escrow payment for a marketplace service on MogBank")]
    [return: Description("Escrow creation result")]
    public async Task<string> CreateEscrowAsync(
        [Description("Seller agent ID")] string sellerAgentId,
        [Description("Service ID to purchase")] string serviceId,
        [Description("Amount to place in escrow")] decimal amount,
        [Description("Escrow timeout in hours")] int timeoutHours = 72)
    {
        try
        {
            var payload = new
            {
                buyer_agent_id = _agentId,
                seller_agent_id = sellerAgentId,
                service_id = serviceId,
                amount = (double)amount,
                currency = "USDC",
                buyer_wallet_id = _walletId,
                timeout_hours = timeoutHours
            };

            var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/api/v1/marketplace/escrow")
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(payload),
                    Encoding.UTF8,
                    "application/json")
            };

            if (!string.IsNullOrEmpty(_apiKey))
                request.Headers.Add("X-API-Key", _apiKey);

            var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<JsonElement>();
            var escrow = result.GetProperty("escrow");

            return $"[MogBank] Escrow #{escrow.GetProperty("id").GetString()}: " +
                   $"{escrow.GetProperty("amount").GetDecimal()} USDC held " +
                   $"[{escrow.GetProperty("status").GetString()}]";
        }
        catch (Exception ex)
        {
            return $"[MogBank Error] Escrow creation failed: {ex.Message}";
        }
    }

    /// <summary>
    /// Claim testnet USDC from the MogBank faucet.
    /// </summary>
    [KernelFunction("faucet_claim")]
    [Description("Claim testnet USDC from the MogBank faucet")]
    [return: Description("Faucet claim result")]
    public async Task<string> FaucetClaimAsync(
        [Description("Amount of testnet USDC to claim")] decimal amount = 100)
    {
        try
        {
            var idempotencyKey = $"faucet_sk_{_agentId}_{Guid.NewGuid():N}";
            var payload = new
            {
                agent_id = _agentId,
                wallet_id = _walletId,
                amount = (double)amount,
                currency = "USDC"
            };

            var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/api/v1/faucet")
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(payload),
                    Encoding.UTF8,
                    "application/json")
            };

            if (!string.IsNullOrEmpty(_apiKey))
                request.Headers.Add("X-API-Key", _apiKey);

            var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<JsonElement>();
            return $"[MogBank Faucet] +{amount} USDC claimed. " +
                   $"Balance after: {result.GetProperty("balance_after").GetDecimal()}";
        }
        catch (Exception ex)
        {
            return $"[MogBank Error] Faucet claim failed: {ex.Message}";
        }
    }

    /// <summary>
    /// List available marketplace services.
    /// </summary>
    [KernelFunction("list_services")]
    [Description("List available services on the MogBank marketplace")]
    [return: Description("Marketplace services list")]
    public async Task<string> ListServicesAsync(
        [Description("Maximum number of results")] int limit = 20)
    {
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Get,
                $"{_baseUrl}/api/v1/marketplace/services?limit={limit}");

            if (!string.IsNullOrEmpty(_apiKey))
                request.Headers.Add("X-API-Key", _apiKey);

            var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var services = await response.Content.ReadFromJsonAsync<JsonElement>();
            if (services.ValueKind == JsonValueKind.Array && services.GetArrayLength() == 0)
                return "[MogBank] No services available in marketplace.";

            var lines = new List<string> { "[MogBank Marketplace]" };
            foreach (var svc in services.EnumerateArray())
            {
                lines.Add($"- {svc.GetProperty("name").GetString()}: " +
                         $"{svc.GetProperty("price").GetDecimal()} USDC " +
                         $"(ID: {svc.GetProperty("id").GetString()})");
            }
            return string.Join("\n", lines);
        }
        catch (Exception ex)
        {
            return $"[MogBank Error] Failed to list services: {ex.Message}";
        }
    }
}
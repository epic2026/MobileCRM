import { ArrowLeft, Shield, Phone, Mic, Database, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const lastUpdated = "January 14, 2026";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Privacy Policy</h1>
          </div>
        </div>
      </header>

      <main className="p-4 pb-24 max-w-2xl mx-auto space-y-6">
        <div className="text-sm text-muted-foreground">
          Last updated: {lastUpdated}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Introduction</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>
              CallFlow CRM ("we", "our", or "us") is committed to protecting your privacy. 
              This Privacy Policy explains how we collect, use, and safeguard your information 
              when you use our mobile application.
            </p>
            <p>
              By using CallFlow CRM, you agree to the collection and use of information 
              in accordance with this policy.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-4 w-4 text-primary" />
              Call Log Access
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p><strong>What we access:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Phone numbers from your call history</li>
              <li>Call duration and timestamps</li>
              <li>Call type (incoming, outgoing, missed)</li>
              <li>Contact names (if available)</li>
            </ul>
            <p><strong>Why we need it:</strong></p>
            <p>
              Call log access enables automatic synchronization of your phone calls with 
              your CRM leads. This helps you track customer interactions, log call activities, 
              and maintain accurate records without manual data entry.
            </p>
            <p><strong>How we use it:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Match calls to existing leads in your CRM</li>
              <li>Create activity logs for customer interactions</li>
              <li>Display recent calls within the app for quick reference</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mic className="h-4 w-4 text-primary" />
              Audio File Access
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p><strong>What we access:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Call recording audio files already stored on your device</li>
            </ul>
            <p><strong>Why we need it:</strong></p>
            <p>
              Audio file access allows the app to scan and import device call recordings 
              so they can be matched with leads and attached to CRM activity history.
            </p>
            <p><strong>How we use it:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Scan eligible call recordings saved on your device</li>
              <li>Match recordings to leads and call activities</li>
              <li>Import selected recordings into your CRM workspace</li>
            </ul>
            <p className="bg-muted p-3 rounded-lg">
              <strong>Important:</strong> The app does NOT create phone call recordings by itself. 
              It only reads recordings that already exist on your device when auto-import or device scan is used.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" />
              Data Storage
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p><strong>Where your data is stored:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Lead and contact information is stored securely in our cloud database</li>
              <li>Imported call recordings may remain on your device and may also be uploaded to secure app storage</li>
              <li>Call activity logs are synced to your account</li>
            </ul>
            <p><strong>Data retention:</strong></p>
            <p>
              Your data is retained as long as you maintain an active account. 
              You can delete your data at any time through the app settings.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4 text-primary" />
              Data Security
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>We implement industry-standard security measures including:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Encryption of data in transit (HTTPS/TLS)</li>
              <li>Encryption of data at rest</li>
              <li>Secure authentication protocols</li>
              <li>Regular security audits</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data Sharing</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>
              We do NOT sell, trade, or rent your personal information to third parties.
            </p>
            <p>We may share data only in these circumstances:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>With your explicit consent</li>
              <li>To comply with legal obligations</li>
              <li>To protect our rights and safety</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Rights</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>You have the right to:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Delete your data</li>
              <li>Revoke permissions at any time through device settings</li>
              <li>Export your data</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Us</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              If you have questions about this Privacy Policy, please contact us at:
            </p>
            <p className="mt-2">
              <strong>Email:</strong> privacy@callflowcrm.com
            </p>
          </CardContent>
        </Card>

        <div className="text-center text-xs text-muted-foreground pt-4">
          © 2026 CallFlow CRM. All rights reserved.
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicy;

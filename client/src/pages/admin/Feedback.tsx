import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import type { UserFeedback } from "@shared/schema";

export default function AdminFeedback() {
  const { data: feedbackRaw = [], isLoading } = useQuery<UserFeedback[]>({
    queryKey: ["/api/feedback"],
  });

  // Sort by most recent first
  const feedback = [...feedbackRaw].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const positiveCount = feedback.filter((f) => f.rating === "positive").length;
  const negativeCount = feedback.filter((f) => f.rating === "negative").length;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-display">User Feedback</h1>
        <p className="text-muted-foreground mt-2">
          Feedback from artists about their submission experience
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Responses</CardTitle>
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{feedback.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Positive</CardTitle>
            <ThumbsUp className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{positiveCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Negative</CardTitle>
            <ThumbsDown className="w-4 h-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{negativeCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Feedback</CardTitle>
          <CardDescription>
            Responses sorted by most recent
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Loading...</p>
          ) : feedback.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No feedback received yet
            </p>
          ) : (
            <div className="space-y-4">
              {feedback.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-4 p-4 border rounded-lg"
                  data-testid={`feedback-${item.id}`}
                >
                  <div className="flex-shrink-0 mt-1">
                    {item.rating === "positive" ? (
                      <ThumbsUp className="w-5 h-5 text-green-600" />
                    ) : (
                      <ThumbsDown className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.artistName && (
                        <span className="font-medium">{item.artistName}</span>
                      )}
                      {item.artistEmail && (
                        <span className="text-sm text-muted-foreground">
                          ({item.artistEmail})
                        </span>
                      )}
                      {!item.artistName && !item.artistEmail && (
                        <span className="text-muted-foreground">Anonymous</span>
                      )}
                    </div>
                    {item.feedback && (
                      <p className="mt-2 text-sm">{item.feedback}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(item.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

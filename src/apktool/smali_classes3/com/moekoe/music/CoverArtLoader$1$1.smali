.class Lcom/moekoe/music/CoverArtLoader$1$1;
.super Ljava/lang/Object;
.source "CoverArtLoader.java"

# interfaces
.implements Ljava/lang/Runnable;


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lcom/moekoe/music/CoverArtLoader$1;->run()V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic this$0:Lcom/moekoe/music/CoverArtLoader$1;

.field final synthetic val$result:Landroid/graphics/Bitmap;


# direct methods
.method constructor <init>(Lcom/moekoe/music/CoverArtLoader$1;Landroid/graphics/Bitmap;)V
    .locals 0
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "()V"
        }
    .end annotation

    .line 80
    iput-object p1, p0, Lcom/moekoe/music/CoverArtLoader$1$1;->this$0:Lcom/moekoe/music/CoverArtLoader$1;

    iput-object p2, p0, Lcom/moekoe/music/CoverArtLoader$1$1;->val$result:Landroid/graphics/Bitmap;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public run()V
    .locals 5

    .line 83
    iget-object v0, p0, Lcom/moekoe/music/CoverArtLoader$1$1;->this$0:Lcom/moekoe/music/CoverArtLoader$1;

    iget-object v0, v0, Lcom/moekoe/music/CoverArtLoader$1;->val$session:Landroid/media/session/MediaSession;

    iget-object v1, p0, Lcom/moekoe/music/CoverArtLoader$1$1;->val$result:Landroid/graphics/Bitmap;

    iget-object v2, p0, Lcom/moekoe/music/CoverArtLoader$1$1;->this$0:Lcom/moekoe/music/CoverArtLoader$1;

    iget-object v2, v2, Lcom/moekoe/music/CoverArtLoader$1;->val$titleWithArtist:Ljava/lang/String;

    iget-object v3, p0, Lcom/moekoe/music/CoverArtLoader$1$1;->this$0:Lcom/moekoe/music/CoverArtLoader$1;

    iget-wide v3, v3, Lcom/moekoe/music/CoverArtLoader$1;->val$durationMs:J

    invoke-static {v0, v1, v2, v3, v4}, Lcom/moekoe/music/CoverArtLoader;->access$300(Landroid/media/session/MediaSession;Landroid/graphics/Bitmap;Ljava/lang/String;J)V

    .line 84
    return-void
.end method
